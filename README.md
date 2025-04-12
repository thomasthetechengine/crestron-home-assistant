# crestron-home-assistant
Connects Crestron controllers to Home Assistant via a Node JS Webserver

This plugin is designed for Home Assistant to be the back-end, and Crestron to be used as a front-end interface for users, however logic gates on controllers can still be implemented to certain entities, but can cause syncing issues between states. 

Any join can be linked to any attribute or state of a entity in home assistant, for example I have an input_boolean, which is the helper equivalent of a switch, triggering some relays on my Crestron controller (CP2E), which allows me to open and close my relays on my controller from Home Assistant. This can also be used to send IR or Serial outputs from controllers & other Crestron devices, the possibilities are endless.

Latency is not a concern, I've never experienced any lag, stutters or dropped service calls whilst developing and testing this node js server, I am quite impressed with the outcome.
Some bits of code are quite messy, and I'm expecting there to be obvious bugs which I haven't discovered yet, every Home Assistant and Crestron setup is different and unique, and can come with its own complications and difficulties.

# Crestron Controller Setup

This node js server mimics a crestron panel, in your controller, assign one of your IP ID's to an XPanel, which this node js server will be sending and recieving from. Due to a bug you can only use single digit IP ID numbers.

![image](https://github.com/user-attachments/assets/11d81a67-4470-4600-83b8-7dd5f78ee713)

When creating analog sliders / inputs on your touch panels, keep the maxmium value to 255, since anything higher breaks the plugin, use the `Ranges` option on your entites in `configuration.json` to convert the value to a different range.

# Known Bugs

The IP ID of the plugin can only be a singular digit

Analog values can only be sent from 0 to 255 (8 bit), but can be converted by the plugin using the Ranges option (See configuration examples below)

There is no current way to get the state of a join from crestron, only subscribe to its updates.

Updating configuration.json sometimes requires a restart of the plugin to take full effect.

# Setup
Download project source, and extract the files to a memorable destination.

Edit configuration.json to match your Home Assistant server, and your Crestron Controller

There is no need to point Crestron or Home Assistant to this web server, the only IP addresses that need to be entered are in `configuration.json`, everything is able to talk over different subnets, providing there is an accessible route between them.

Install all the packages in package.json

Navigate to the directory via Terminal (Or command prompt for windows)

Run `node .`

# Auto restart
If you want the server to auto restart after a crash / error, install forever
`npm install forever -g` 

Then to run the server, in your CLI, type `forever .`

# Configuration Guide

EntityGet: Pulls the state of the specified entity, and outputs it to a txt file. Useful for creating configs for devices.

Debug: Enables debug output on the CLI

Restart: Digital join, when set to high will refresh all device states from home assistant into crestron.

CustomServiceCalls: Can be used so when a digital join is recieved, it can trigger custom service calls into home assistant, I added this feature to use with my alarm, which intergrates with home assistant. Very useful when states cant be 1:1 mapped with service calls. See example in the configuration.json file.

Join Types:
```
D = Digital (0 or 1 (0 for false, 1 for true))
A = Analog (1-255)
S = Serial (Strings "Hello there!)

Example
D1 = Digital Join ID 1
S4 = Serial Join ID 4
A9 = Analog Join ID 9
```

Entity (Entities):
```json
"switch.example": { -- Needs to match the exact name in HA
            "Type": "switch", -- Type of device
            "UpdateFrom": "HomeAssistant", -- What end controls this device, when set to home assistant, if set to HomeAssistant, on startup home assistant will update the joins appropriately. However if you have a device that is controlled by crestron, and using HA as a frontend, setting this value to Crestron will allow crestron to be the main point of control, and prevent feedback loops. You must also set the UserID in configuration.json aswell.
            "switch": "D3", -- Which join to link to the switch D = Digtial, 3 = Join ID
            "switchtype": "pulse" -- What type of value does the node js server expect from crestron, pulse is for digital joins direct from a button, toggle is for joins that go through a toggle gate
        },
"light.example": {
            "Type": "light",
            "UpdateFrom": "HomeAssistant",
            "switch": "D1",
            "switchtype": "pulse",
            "Attributes": { -- Different types of attributes, dont know your devices attributes? Put your entity ID into EntityGet to learn them!
                "brightness": "A4",
                "color_temp_kelvin": "A5",
                "rgb_color": ["A1","A2","A3"], -- R = Analog Join 1, G = Analog Join 2, B = Analog Join 3
                "effect": "S3" - Serial Join ID 3
            },
            "Ranges": { -- Analog joins can only send values between 1 and 255, ranges converts the values from crestron back into different specificed numbers.
                "brightness": [1,255],
                "color_temp_kelvin": [2700,6500]
            },
            "RefreshWhenOff":{ -- Attributes to keep active, even when the device is turned off
                "brightness": true
            }
        },
"select.example": {
            "Type": "select",
            "UpdateFrom": "HomeAssistant",
            "state": "S2",
            "ServiceTypes":{ -- When updating the attribute of a device, usually "turn_on" is the required service, however certain entities require different service call types.
                "state": "select_option"
            },
            "AttributeTranslate": { // Translates one attribute type into another when sending service calls, certain entities send attributes as different properties, but expect different ones when updated with a service call.
                "state": "option"
            }
        }
```

# SIMPL Examples

![image](https://github.com/user-attachments/assets/d5c90545-5138-4bac-8f8a-8e281ab30ac2)

![image](https://github.com/user-attachments/assets/59db1b47-21bf-4398-a8ee-d9fa43f2347b)

![image](https://github.com/user-attachments/assets/39e7938e-0a42-4e43-8294-536383588bee)

![image](https://github.com/user-attachments/assets/bba598dc-81e4-4e19-babd-8f07d9e820ba)

![image](https://github.com/user-attachments/assets/91216ea5-209c-4b2b-9140-727243f96c33)

# A very bad flowchart example

![image](https://github.com/user-attachments/assets/950c5131-bfa5-4d61-8c77-139d2bfd466b)

