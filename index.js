//import { createRequire } from "module";
//const require = createRequire(import.meta.url)
var config = require('./configuration.json');
const Homeassistant = require('node-homeassistant')
const fs = require('fs')
const cipclient = require('./crestroncip.js');

var Cache = {} // Cahced devices and joins
var HACache = {}
var Entities = config.Entities
var EntGot = false

// Auto configuration updater
var ConfigCooldown = false
fs.watch("configuration.json", (eventType, filename) => {
    if (eventType === "change") {
        if (ConfigCooldown === true) return
        (async function () {
            const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
            ConfigCooldown = true
            await sleep(300)
            if (config.Debug) { console.log("Updating config from configuration.json") } // Debug output
            delete require.cache[require.resolve('./configuration.json')]
            config = require('./configuration.json');
            Cache = {}
            EntGot = false
            Entities = config.Entities
            await sleep(1000)
            ConfigCooldown = false
        })()
    }
});

const TypeTable = { // Quick and easy way to translate from config to Crestron CPI, & Vice Versa
    "A": "analog",
    "D": "digital",
    "S": "serial",
    "analog": "A",
    "digital": "D",
    "serial": "S"
}


const OldRange = {
    min: 1,
    max: 255
}

var SentCache = {
    Digital: {},
    Analog: {},
    Serial: {}
}

var RecievedCache = {
    Digital: {},
    Analog: {},
    Serial: {}
}

var RGBTemporaryTemplate = {
    R: null,
    G: null,
    B: null
}

var rgb_color_temp = []

function convertRange(value, oldRange, newRange) {
    return ((value - oldRange.min) * (newRange.max - newRange.min)) / (oldRange.max - oldRange.min) + newRange.min;
}

async function FindJoin(Device, DeviceType, Property, Position) { // Pulls the specific join from a property, including its type
    if (Cache[Device + DeviceType + Property]) return Cache[Device + DeviceType + Property]
    if (!Entities[Device]) return "No device"

    if (Property === "press" || Property === "switch"){
        if (Entities[Device][Property]) {
            Value = Entities[Device][Property]
            Attribute = false
            var ID = Value.substring(1, Value.length)
            var JoinType = Value.substring(0, 1)
            Cache[Device + DeviceType + Property] = { ID: ID, JoinType: TypeTable[JoinType], Property: Entities[Device][Property], Device: Entities[Device] }
            return { ID: ID, JoinType: TypeTable[JoinType], Property: Entities[Device][Property], Device: Entities[Device] }
        } else {
            return "Invalid Join"
        }
    }

    if ((Property === "R" || Property === "G" || Property === "B") && !Entities[Device].Attributes.rgb) return "No property"
    if ((Property !== "press" || Property !== "switch") && Property !== "R" && Property !== "G" && Property !== "B" && !Entities[Device].Attributes[Property]) return "No property1"
    if ((Property === "press" || Property === "switch") && Property !== "R" && Property !== "G" && Property !== "B" && !Entities[Device][Property]) return "No property2"


    var Value
    var Attribute = true
    if (Entities[Device][Property]) {
        Value = Entities[Device][Property]
        Attribute = false
    } else { 
        if (Entities[Device]['Attributes'] !== null && Entities[Device].Attributes[Property] !== null) {
            Value = Entities[Device].Attributes[Property]
        } else {
            if (Entities[Device]['Attributes'] !== null && Entities[Device].Attributes[Property] !== null && typeof Entities[Device].Attributes[Property] === "object" && Entities[Device].Attributes[Property][0] !== null) {
                if (Position) {
                    Value = Entities[Device].Attributes[Property][Position]
                }
            }
        }
    }

    if (Value === undefined) return null
    var ID = Value.substring(1, Value.length)
    var JoinType = Value.substring(0, 1)
    if (!TypeTable[JoinType]) return "Invalid Join"
    if (Attribute) {
        Cache[Device + DeviceType + Property] = { ID: ID, JoinType: TypeTable[JoinType], Property: Entities[Device].Attributes[Property], Device: Entities[Device] }
        return { ID: ID, JoinType: TypeTable[JoinType], Property: Entities[Device].Attributes[Property], Device: Entities[Device] }
    } else {
        Cache[Device + DeviceType + Property] = { ID: ID, JoinType: TypeTable[JoinType], Property: Entities[Device][Property], Device: Entities[Device] }
        return { ID: ID, JoinType: TypeTable[JoinType], Property: Entities[Device][Property], Device: Entities[Device] }
    }
}

async function FindProperty(JoinType, ID) { // Finds a specific property and device from the specified join
    // if (Cache[JoinType + String(ID)]) return Cache[JoinType + String(ID)]
    if (!TypeTable[JoinType]) return "Invalid Join Type"
    var Match = TypeTable[JoinType] + String(ID)
    for (var DeviceName in Entities) {
        var Device = Entities[DeviceName]
        for (var MajorPropertyName in Device) {
            if (Device[MajorPropertyName] === Match) {
                Send = {
                    DeviceType: Device.Type,
                    Device: DeviceName,
                    Property: MajorPropertyName,
                }
            }
        }
        if (Send) {
            Cache[JoinType + String(ID)] = Send
            return Send
        }
        if (Device["Attributes"]) {
            for (var PropertyName in Device.Attributes) {
                if (!Device.Attributes[PropertyName]) continue
                var Property = Device.Attributes[PropertyName]
                var Send
                if (Property === Match) {
                    var Send = {
                        DeviceType: Device.Type,
                        Device: DeviceName,
                        Property: PropertyName,
                    }
                }

                if (typeof Property === "object" && Property[0]) {
                    for (var i = 0; i < Property.length; i++) {
                        if (Property[i] === Match) {
                            var Send = {
                                DeviceType: Device.Type,
                                Device: DeviceName,
                                Property: PropertyName,
                                Position: i
                            }
                            break
                        }
                    }
                }

                if (Send) {
                    Cache[JoinType + String(ID)] = Send
                    return Send
                }
            }
        }

    }
    return "No matching property found"
}

//Exanmples
//FindProperty("analog","2").then(res => console.log(res))
//FindJoin("light.pool_lights","light","B").then(res => console.log(res))

let ha = new Homeassistant({ // Log into HA
    host: config.HomeAssistantConfig.Host,
    protocol: config.HomeAssistantConfig.Protocol, // "ws" (default) or "wss" for SSL
    retryTimeout: 1000, // in ms, default is 5000
    retryCount: 3, // default is 10, values < 0 mean unlimited
    //password: 'http_api_password', // api_password is getting depricated by home assistant
    token: config.HomeAssistantConfig.Token, // for now both tokens and api_passwords are suported
    port: config.HomeAssistantConfig.Port
})

// Connect to Crestron
var str = config.CrestronConfig.IPID
var code = ""
for (let i = 0; i < str.length; i++) {
    code = code + String.fromCharCode(str.charAt(i))
}
const cip = cipclient.connect({ host: config.CrestronConfig.Host, ipid: String.fromCharCode(config.CrestronConfig.IPID) }, () => {
    console.log(`Crestron | Connected to ${config.CrestronConfig.Host} with IP ID ${config.CrestronConfig.IPID}`)
})

function SetDigital(Join, Value) { // Setting digital values + debug output
    // if (SentCache.Digital[Join] === Value) return
    SentCache.Digital[Join] = Value
    if (config.Debug) { console.log(`Setting digital join ${String(Join)} to: ${String(Value)}`) }
    cip.dset(Join, Value)
}

function SetAnalog(Join, Value) { // Setting analog values + debug output
    if (SentCache.Analog[Join] === Value) return
    SentCache.Analog[Join] = Value
    if (config.Debug) { console.log(`Setting analog join ${String(Join)} to: ${String(Value)}`) }
    cip.aset(Join, Value)
}

function SetSerial(Join, Value) { // Setting analog values + debug output
    //if (SentCache.Serial[Join] === Value) return
    SentCache.Serial[Join] = Value
    if (config.Debug) { console.log(`Setting serial join ${String(Join)} to: ${String(Value)}`) }
    cip.sset(Join, String(Value))
}

const DeviceFunctions = { // Functions per device
    switch: function (Entity, CrestronData) { // HA Switches (Also includes switching bulbs, and other entities)
        if (CrestronData.value === 1) {
            ha.call({
                domain: Entity.DeviceType,
                service: "turn_on",
                target: {
                    "entity_id": Entity.Device
                }
            }).then(res => {
                if (config.Debug) {
                    console.log("Call feedback: ", res)
                }
            })
        }
        if (CrestronData.value === 0) {
            ha.call({
                domain: Entity.DeviceType,
                service: "turn_off",
                target: {
                    "entity_id": Entity.Device
                }
            }).then(res => {
                if (config.Debug) {
                    console.log("Call feedback: ", res)
                }
            })
        }
    },

    press: function (Entity, CrestronData) { // HA Press
        if (CrestronData.value === 1) {
            ha.call({
                domain: Entity.DeviceType,
                service: "press",
                target: {
                    "entity_id": Entity.Device
                }
            }).then(res => {
                if (config.Debug) {
                    console.log("Call feedback: ", res)
                }
            })
        }
    },


    rgb: function (Entity, CrestronData) { // RGB Specific function for RGB bulbs
        var RGB = RGBTemporaryTemplate
        RGBTemporaryTemplate = {
            R: null,
            G: null,
            B: null
        }

        if (!CrestronData.type === "analog") return
        ha.call({
            domain: "light",
            service: "turn_on",
            target: {
                "entity_id": Entity.Device
            },
            service_data: {
                rgb_color: [RGB.R, RGB.G, RGB.B],
            }
        })//.then(res => console.log(res))
    },

    PropertyArray: async function (Entity, CrestronData, Property) { // Properties that are within an array on home assistant
        var Set
        var Set2
        var Device = Entity.Device
        var PropertyName = Property
        if (Entities[Device]["Ranges"] && Entities[Device].Ranges[PropertyName]) {
            Set = convertRange(CrestronData.value, OldRange, { min: Entities[Device].Ranges[PropertyName][0], max: Entities[Device].Ranges[PropertyName][1] })
        } else {
            Set = CrestronData.value
        }
        if (PropertyName === "rgb_color") { // Waits until all rgb values are recieved
            rgb_color_temp[Entity.Position] = Set
            if (rgb_color_temp[0] && rgb_color_temp[1] && rgb_color_temp[2]) {

                Set2 = rgb_color_temp
                rgb_color_temp = []
            } else return
        } else {
            if (!HACache[Entity.Device]) {
                HACache[Entity.Device] = ha.state(Entity.Device)
            }
            await HACache[Entity.Device]
            if (HACache[Entity.Device] && HACache[Entity.Device].attributes && HACache[Entity.Device].attributes[PropertyName]) {
                var Set2 = HACache[Entity.Device].attributes[PropertyName]
            }
            if (!Set2) return
            Set2[Entity.Position] = Set
        }
        var servicetype = "turn_on"
        if (Entities[Device]["ServiceTypes"] && Entities[Device].ServiceTypes[PropertyName]) servicetype = Entities[Device].ServiceTypes[PropertyName]
        if (Entities[Device]["AttributeTranslate"] && Entities[Device].AttributeTranslate[PropertyName]) Property = Entities[Device].AttributeTranslate[PropertyName]
        ha.call({
            domain: Entity.DeviceType,
            service: servicetype,
            target: {
                "entity_id": Entity.Device
            },
            service_data: {
                [Property]: Set2
            }
        }).then(res => {
            if (config.Debug) {
                console.log("Call feedback: ", res)
            }
        })

    },

    Property: function (Entity, CrestronData, Property) { // Single attributes that aren't in an array.
        var Set
        var Device = Entity.Device
        var PropertyName = Property
        if (CrestronData.type == "analog") {
            if (Entities[Device]["Ranges"] && Entities[Device].Ranges[PropertyName]) {
                Set = convertRange(CrestronData.value, OldRange, { min: Entities[Device].Ranges[PropertyName][0], max: Entities[Device].Ranges[PropertyName][1] })
            } else {
                Set = CrestronData.value
            }
        }
        if (CrestronData.type == "digital") {
            if (CrestronData.value === 1) Set = true
            if (CrestronData.value === 0) Set = false
        }
        if (CrestronData.type == "serial") {
            Set = CrestronData.value
        }
        var servicetype = "turn_on"
        if (Entities[Device]["ServiceTypes"] && Entities[Device].ServiceTypes[PropertyName]) servicetype = Entities[Device].ServiceTypes[PropertyName]
        if (Entities[Device]["AttributeTranslate"] && Entities[Device].AttributeTranslate[PropertyName]) Property = Entities[Device].AttributeTranslate[PropertyName]
        ha.call({
            domain: Entity.DeviceType,
            service: servicetype,
            target: {
                "entity_id": Entity.Device
            },
            service_data: {
                [Property]: Set,
            }
        }).then(res => {
            if (config.Debug) {
                console.log("Call feedback: ", res)
            }
        })

    }
}

function UpdateFromHomeAssistant(DeviceName, HomeAssistData, Startup) {
    var Name = HomeAssistData.entity_id
    var Type = Name.split(".")[0]
    var Device = Name

    //if (DeviceStates[type]) return DeviceStates[type](data, name, type)
    //DeviceStates[type](data, name, type)
    if (!HomeAssistData.new_state) return
    if (HomeAssistData.new_state.state === "on") {
        HACache[Name] = HomeAssistData.new_state
    } else {
        if (HACache[Name] && HomeAssistData.new_state.state === "off") {
            HACache[Name].state === "off"
        }
    }
    if (Type === "button" || Type === "input_button"){
        FindJoin(Name, Type, "press").then(async (Join) => {
            if (Join) {
                if (typeof Join === "string") return;
                if (Entities[Device]["UpdateFrom"] !== null && Entities[Device].UpdateFrom === "Crestron" && HomeAssistData.new_state.context.user_id === config.HomeAssistantConfig.UserID) { } else {
                    if (Join.JoinType === "digital") { 
                        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
                        SetDigital(Join.ID, 1)
                        await sleep(100)
                        SetDigital(Join.ID, 0)
                     }
                }
    
            }
        })
        return
    }

    FindJoin(Name, Type, "switch").then(async (Join) => {
        if (Join) {
            if (typeof Join === "string") return;
            var value = 0
            if (HomeAssistData.new_state.state === 'on') { value = 1 };
            if (Entities[Device]["UpdateFrom"] !== null && Entities[Device].UpdateFrom === "Crestron" && HomeAssistData.new_state.context.user_id === config.HomeAssistantConfig.UserID) { } else {
                if (Join.JoinType === "digital") { SetDigital(Join.ID, value) }
            }

        }
    })
    for (var MajorPropertyName in Entities[Device]) {
        if (HomeAssistData.new_state[MajorPropertyName]) {
            //if(HomeAssistData.new_state.state === "off" && Startup === false && Entities[Device]["RefreshWhenOff"] && !Entities[Device].RefreshWhenOff[MajorPropertyName]) return console.log("offed")
            var Value = Entities[Device][MajorPropertyName]
            var ID = Value.substring(1, Value.length)
            var JoinType = Value.substring(0, 1)
            var Set
            if (JoinType === "A") {
                if (Entities[Device]["Ranges"] && Entities[Device].Ranges[ProperMajorPropertyNametyName]) {
                    Set = convertRange(HomeAssistData.new_state[MajorPropertyName], { min: Entities[Device].Ranges[MajorPropertyName][0], max: Entities[Device].Ranges[MajorPropertyName][1] }, OldRange)
                } else {
                    Set = HomeAssistData.new_state[MajorPropertyName]
                }
            }
            var Set2Init
            if (JoinType === "D") {
                if (HomeAssistData.new_state[MajorPropertyName] === true) Set2Init = 1
                if (HomeAssistData.new_state[MajorPropertyName] === false) Set2Init = 0
            }
            if (Entities[Device]["UpdateFrom"] !== null && Entities[Device].UpdateFrom === "Crestron" && HomeAssistData.new_state.context.user_id === config.HomeAssistantConfig.UserID) { } else {
                if (JoinType === "S") { Set = HomeAssistData.new_state[MajorPropertyName]; SetSerial(ID, Set) }
                if (JoinType === "D") { SetDigital(ID, Set2Init) }
                if (JoinType === "A") { SetAnalog(ID, Set) }
            }
        }
    }
    if (Entities[Device] && Entities[Device]["Attributes"]) {
        for (var PropertyName in Entities[Device].Attributes) {
            //if(HomeAssistData.new_state.state === "off" && Startup === false && Entities[Device]["RefreshWhenOff"] && Entities[Device].RefreshWhenOff[PropertyName]){}else{return}
            var Property = Entities[Device].Attributes[PropertyName]
            if (typeof Property === "object" && Property[1]) {
                if (HomeAssistData.new_state.attributes[PropertyName]) {
                    for (var i = 0; i < Property.length; i++) {
                        if (Property[i] !== "x") {
                            var Value = Property[i]
                            var ID = Value.substring(1, Value.length)
                            var JoinType = Value.substring(0, 1)
                            if (JoinType === "A") {
                                var Set
                                if (Entities[Device]["Ranges"] && Entities[Device].Ranges[PropertyName]) {
                                    Set = convertRange(HomeAssistData.new_state.attributes[PropertyName][i], { min: Entities[Device].Ranges[PropertyName][0], max: Entities[Device].Ranges[PropertyName][1] }, OldRange)
                                } else {
                                    Set = HomeAssistData.new_state.attributes[PropertyName][i]
                                }
                                if (Entities[Device]["UpdateFrom"] !== null && Entities[Device].UpdateFrom === "Crestron" && HomeAssistData.new_state.context.user_id === config.HomeAssistantConfig.UserID) { } else {
                                    SetAnalog(ID, Set)
                                }

                            } else {
                                var Set2
                                if (JoinType === "D") {
                                    if (HomeAssistData.new_state.attributes[PropertyName][i] === true) Set2 = 1
                                    if (HomeAssistData.new_state.attributes[PropertyName][i] === false) Set2 = 0
                                    if (Entities[Device]["UpdateFrom"] !== null && Entities[Device].UpdateFrom === "Crestron" && HomeAssistData.new_state.context.user_id === config.HomeAssistantConfig.UserID) { } else {
                                        SetDigital(ID, Set2)
                                    }

                                } else {
                                    if (Entities[Device]["UpdateFrom"] !== null && Entities[Device].UpdateFrom === "Crestron" && HomeAssistData.new_state.context.user_id === config.HomeAssistantConfig.UserID) { } else {
                                        if (JoinType === "S") { SetSerial(ID, HomeAssistData.new_state.attributes[PropertyName][i]) }
                                    }

                                }
                            }

                        }
                    }
                }
            } else {
                if (Entities[Device] && HomeAssistData.new_state.attributes[PropertyName] !== undefined && HomeAssistData.new_state.attributes[PropertyName] !== null) {
                    var Value = Entities[Device].Attributes[PropertyName]
                    var ID = Value.substring(1, Value.length)
                    var JoinType = Value.substring(0, 1)
                    if (JoinType === "A") {
                        var Set
                        if (Entities[Device]["Ranges"] && Entities[Device].Ranges[PropertyName]) {
                            Set = convertRange(HomeAssistData.new_state.attributes[PropertyName], { min: Entities[Device].Ranges[PropertyName][0], max: Entities[Device].Ranges[PropertyName][1] }, OldRange)
                        } else {
                            Set = HomeAssistData.new_state.attributes[PropertyName]
                        }
                        if (Entities[Device]["UpdateFrom"] !== null && Entities[Device].UpdateFrom === "Crestron" && HomeAssistData.new_state.context.user_id === config.HomeAssistantConfig.UserID) { } else {
                            SetAnalog(ID, Set)
                        }
                    } else {
                        var Set2
                        if (JoinType === "D") {
                            if (HomeAssistData.new_state.attributes[PropertyName] === true) Set2 = 1
                            if (HomeAssistData.new_state.attributes[PropertyName] === false) Set2 = 0
                            if (Entities[Device]["UpdateFrom"] !== null && Entities[Device].UpdateFrom === "Crestron" && HomeAssistData.new_state.context.user_id === config.HomeAssistantConfig.UserID) { } else {
                                SetDigital(ID, Set2)
                            }
                        } else {
                            if (Entities[Device]["UpdateFrom"] !== null && Entities[Device].UpdateFrom === "Crestron" && HomeAssistData.new_state.context.user_id === config.HomeAssistantConfig.UserID) { } else {
                                if (JoinType === "S") { SetSerial(ID, HomeAssistData.new_state.attributes[PropertyName]) }
                            }
                        }
                    }

                    // if (JoinType === "S") { SetSerial(ID, HomeAssistData.new_state.attributes[PropertyName]) }
                    //if (JoinType === "D") { SetDigital(ID, Set2) }
                    // if (JoinType === "A") { SetAnalog(ID, Set) }
                }
            }
        }
    }

}

async function ManuallyUpdateAllFromHA() {
    for (var DeviceName in Entities) { //Subscribe to device changes from HA
        //Startup to grab new states
        var Device = Entities[DeviceName]
        if (DeviceName && Device && Device["UpdateFrom"] !== null && Device.UpdateFrom === "HomeAssistant") {
            const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
            await sleep(100)
            var FromHA = ha.state(DeviceName)
            if (FromHA && FromHA["entity_id"]) {
                var HomeAssistData = {
                    entity_id: FromHA.entity_id,
                    state: FromHA.state,
                    new_state: FromHA
                }
                // console.log(DeviceName)
                //console.log(HomeAssistData)
                UpdateFromHomeAssistant(DeviceName, HomeAssistData, true)
            }
        }

    }
}

async function CustomServiceCall(CrestronData) {
    delete require.cache[require.resolve('./configuration.json')]
    config = require('./configuration.json');
    let ServiceCalls = config.CustomServiceCalls
    let CallData = ServiceCalls["D" + String(CrestronData.join)]
    let sdata = CallData.service_data
    if (CallData.ServiceDataUsesJoins) {
        for (let valuename in sdata) {
            let Value = sdata[valuename]
            if (Value) {
                let ID = Value.substring(1, Value.length)
                let JoinType = Value.substring(0, 1)
                if (JoinType === "D") { sdata[valuename] = RecievedCache.Digital[ID] }
                if (JoinType === "A") { sdata[valuename] = RecievedCache.Analog[ID] }
                if (JoinType === "S") { sdata[valuename] = RecievedCache.Serial[ID] }
            }

        }
    }
    ha.call({
        domain: CallData.domain,
        service: CallData.service,
        target: {
            "entity_id": CallData.entity_id
        },
        service_data: sdata
    }).then(res => {
        if (config.Debug) {
            console.log("Call feedback: ", res)
        }
    })
}

function UpdateFromCrestron(data) {
    if (data.type === "digital") {
        //if (RecievedCache.Digital[data.join] === data.value) return
        RecievedCache.Digital[data.join] = data.value
        //SetDigital(data.join, data.value)
        if (config["Reset"] && String(data.join) === config.Reset && data.value === 1) {
            console.log("Recieved Reset Join")
            ManuallyUpdateAllFromHA()
            return
        }
        if (config["CustomServiceCalls"] && data.value === 1 && config.CustomServiceCalls["D" + String(data.join)]) {
            CustomServiceCall(data)
            return
        }
    }
    if (data.type === "analog") {
        if (RecievedCache.Analog[data.join] === data.value) return
        RecievedCache.Analog[data.join] = data.value
    }
    if (data.type === "serial") {
        //if (RecievedCache.Serial[data.join] === data.value) return
        RecievedCache.Serial[data.join] = data.value
        SetSerial(data.join, data.value)
    }
    FindProperty(data.type, data.join).then(async (Response) => {
        if (typeof Response === "string") return;
        if (typeof Response.Position !== "undefined") {
            DeviceFunctions.PropertyArray(Response, data, Response.Property)
        } else {
            if (DeviceFunctions[Response.Property]) {
                if (Response.Property === "switch" && Entities[Response.Device]["switchtype"] && Entities[Response.Device].switchtype === "pulse") {
                    if (typeof SentCache.Digital[data.join] === null) {
                        SentCache.Digital[data.join] = 0
                    }
                    if (data.value === 0) return
                    if (SentCache.Digital[data.join] === 1) {
                        data.value = 0
                    }
                    if (SentCache.Digital[data.join] === 0) {
                        data.value = 1
                    }
                    DeviceFunctions[Response.Property](Response, data, Response.Property)
                } else {
                    DeviceFunctions[Response.Property](Response, data, Response.Property)
                }
            } else {
                if (data.type === "digital" && Response.Property === "switch" && Entities[Response.Device]["switchtype"] && Entities[Response.Device].switchtype === "pulse") {
                    if (typeof SentCache.Digital[data.join] === null) {
                        SentCache.Digital[data.join] = 0
                    }
                    if (data.value === 0) return
                    if (SentCache.Digital[data.join] === 1) {
                        data.value = 0
                    }
                    if (SentCache.Digital[data.join] === 0) {
                        data.value = 1
                    }
                    SetDigital(data.join, data.value)
                    DeviceFunctions.Property(Response, data, Response.Property)
                } else {
                    if (data.type === "digital" && Response.Property === "press" && Entities[Response.Device]["press"] && data.value === 1) {
                        DeviceFunctions.press(Response, data, Response.Property)
                    } else {
                        DeviceFunctions.Property(Response, data, Response.Property)
                    }
                }

            }
        }
        // Runs device function to update device on HA
        if (Entities[Response.Device]["UpdateFrom"] !== null && Entities[Response.Device].UpdateFrom === "Crestron") { // Only sends join feedback to crestron if data origniated from HA, otherwise causes looped feedback

        } else {
            if (data.type === "digital") { SetDigital(data.join, data.value) } // Sends the digital join to the feedback join temporarily, before HA confirms the state
            if (data.type === "analog") { SetAnalog(data.join, data.value) } // Sends the analog join to the feedback join
            // if (data.type === "serial") { SetSerial(data.join, data.value) } // Sends the serial join to the feedback join
        }
    })


}

// Connecting to HA
ha.connect().then(async () => {
    console.log(`Home Assistant | Connected to ${config.HomeAssistantConfig.Host} on port ${config.HomeAssistantConfig.Port}`)
    if (config.EntityGet !== "" && EntGot === false) {
        EntGot = true
        var content = ha.state(config.EntityGet)
        if (content !== "undefined" && typeof content !== "undefined") {
            if (content !== "undefined" && typeof content !== "undefined" && typeof content['state'] !== "undefined" && content.state === "off") {
                console.log("The EntityGet Device is currently in the off state, meaning some attributes will appear as null.")
            }
            fs.writeFile(config.EntityGet + ".txt", JSON.stringify(content, null, 2), err => {
                if (err) {
                    console.log(err);
                } else {
                    console.log(`Entity info for ${config.EntityGet} has been written to ${config.EntityGet}.txt`)
                }
            });
            if (config.Debug === true) {
                console.log(content)
            }
        }
    }
    for (var DeviceName in Entities) { //Subscribe to device changes from HA
        //Startup to grab new states
        var Device = Entities[DeviceName]
        if (DeviceName && Device && Device["UpdateFrom"] !== null && Device.UpdateFrom === "HomeAssistant") {
            const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
            await sleep(100)
            var FromHA = ha.state(DeviceName)
            if (FromHA && FromHA["entity_id"]) {
                var HomeAssistData = {
                    entity_id: FromHA.entity_id,
                    state: FromHA.state,
                    new_state: FromHA
                }
                // console.log(DeviceName)
                //console.log(HomeAssistData)
                UpdateFromHomeAssistant(DeviceName, HomeAssistData, true)
            }


        }

        ha.on('state:' + DeviceName, HomeAssistData => {
            console.log(HomeAssistData)
            UpdateFromHomeAssistant(DeviceName, HomeAssistData, false)
        })

    }

    cip.subscribe((data) => { // Incoming data from Crestron
        if (config.Debug) { console.log("Recieved " + data.type + " join with ID: " + data.join + " and a value: of " + data.value) } // Debug output
        UpdateFromCrestron(data)
    })
})



