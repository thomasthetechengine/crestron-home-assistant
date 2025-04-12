const net = require('net');
const EventEmitter = require('events');


const cipEvents = new EventEmitter();

let client;

let digital = new Array(10000);
digital.fill(0);
let analog = new Array(10000);
analog.fill(0);
let serial = new Array(10000);
serial.fill(0);

function concatenate(uint8arrays) {
    const totalLength = uint8arrays.reduce(
        (total, uint8array) => total + uint8array.byteLength,
        0
    );

    const result = new Uint8Array(totalLength);

    let offset = 0;
    uint8arrays.forEach((uint8array) => {
        result.set(uint8array, offset);
        offset += uint8array.byteLength;
    });

    return result;
}
module.exports = {
    connect(params, callback) {
        //const client = new net.createConnection();
        const client = new net.Socket();
        let intervalConnect;
        var Cool = false
        console.log("connecting to " + params.host);

        function connect() {
            client.connect({ port: 41794, host: params.host });
        };

        function callback(e) {
            console.log(e)
        };

        function launchIntervalConnect() {
            if (false != intervalConnect) return
            intervalConnect = setInterval(connect, 5000)
        }

        function clearIntervalConnect() {
            if (false == intervalConnect) return
            clearInterval(intervalConnect)
            intervalConnect = false
        }

        client.on('connect', () => {
            clearIntervalConnect();
            callback();
            let heartbeat = setInterval(() => {
                if (client.readyState == "open")
                    client.write("\x0D\x00\x02\x00\x00");
                else
                    clearInterval(heartbeat);
            }, 5000);
        });

        client.on('data', (data) => {
            let index = 0;
            while (index < data.length) {
                let payloadType = data[index];
                //console.log("type: 0x" + payloadType.toString(16));

                let payloadLength = data[index + 2]
                //console.log("payloadLength: " + payloadLength);

                let payload = data.slice(index + 3, index + 3 + payloadLength);
                //console.log("payloadData: " + payload.toString('hex'));
                //console.log(payload)
                switch (payloadType) {
                    case 0x0f:
                        console.log("Client registration request");
                        client.write("\x01\x00\x0b\x00\x00\x00\x00\x00" + params.ipid + "\x40\xff\xff\xf1\x01");
                        break;
                    case 0x02:
                        if (payloadLength == 4 && payload.toString('hex') == "0000200f") {
                            console.log("registration ok");
                            client.write("\x05\x00\x05\x00\x00\x02\x03\x00");
                        }
                        else if (payloadLength == 3 && payload.toString('hex') == "ffff02") {
                            console.log("registration failed");
                            client.end();
                        }
                        break;
                    case 0x05:
                        //console.log("data");
                        //console.log(payload)
                        switch (payload[3]) {
                            case 0x0:
                                //console.log("digital join " + ((((payload[5] & 0x7F) << 8) | payload[4]) + 1) + " state " + (((payload[5] & 0x80) >> 7) ^ 0x01));
                                digital[((((payload[5] & 0x7F) << 8) | payload[4]) + 1)] = (((payload[5] & 0x80) >> 7) ^ 0x01);
                                cipEvents.emit("data", { type: "digital", join: (((payload[5] & 0x7F) << 8) | payload[4]) + 1, value: (((payload[5] & 0x80) >> 7) ^ 0x01) });
                                break;
                            case 0x1:
                                //console.log("analog join " + (((payload[4] << 8) | payload[5]) + 1) + " value " + ((payload[6] << 8) + payload[7]));
                                analog[(((payload[4] << 8) | payload[5]) + 1)] = ((payload[6] << 8) + payload[7]);
                                // cipEvents.emit("data", {type: "analog", join: ((payload[4] << 8) | payload[5]) + 1, value: (payload[6] << 8) + payload[7]});
                                cipEvents.emit("data", { type: "analog", join: (((payload[5] & 0x7F) << 8) | payload[4]) + 1, value: parseInt(payload[6], 10) });
                                break;
                            case 0x02: // SERIAL
                                var buf = new Buffer(payload, 'hex');
                                var buftostring = buf.toString('utf-8')
                                const buf2 = Buffer.from(buftostring, 'utf8');
                                var split = buftostring.split(",")
                                var value = split[2].split("\r")[0]
                                var join = split[1].substring(2)
                                cipEvents.emit("data", { type: "serial", join: join, value: value });
                                serial[([join] = value)]
                                break;
                            case 0x03:
                                //console.log("update request");
                                break;
                        }
                        break;
                    case 0x0D:
                    case 0x0E:
                        //console.log("heartbeat");
                        break;
                }
                index = index + payloadLength + 3;
            }
        });

        client.on('end', () => {
            console.log('disconnected from server');
            launchIntervalConnect();
        });

        client.on('close', launchIntervalConnect);

        client.on('error', () => {
            console.log('socket error');
            launchIntervalConnect();
        });

        connect();

        return {
            sset: (join, value) => {
                if (!value) return
                //const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
                var valuelen = value.length
                var value2 = new TextEncoder().encode(`${value}\n`)
                var sjoin = new Uint8Array([0x05, 0x00, 0x08, 0x00, 0x00, 0x05, 0x15, 0x00, 0x00, 0x03]);
                sjoin = concatenate([sjoin, value2])
                var sdataView = new DataView(sjoin.buffer);
                sdataView.setUint16(7, join - 1);
                sdataView.setUint8(2, 8 + valuelen);
                sdataView.setUint8(5, 4 + valuelen);
                //console.log(sjoin)
                //await sleep(100)
                client.write(sjoin)
            },

            aset: (join, value) => {
                let ajoin = new Uint8Array([0x05, 0x00, 0x08, 0x00, 0x00, 0x05, 0x14, 0x00, 0x00, 0x00, 0x00]);
                let dataView = new DataView(ajoin.buffer);
                dataView.setUint16(7, join - 1);
                dataView.setUint16(9, value);
                client.write(ajoin);
            },
            dset: (join, value) => {
                let djoin = new Uint8Array([0x05, 0x00, 0x06, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00]);
                let dataView = new DataView(djoin.buffer);
                //console.log(join, value)
                if (!value)
                    join |= 0x8000;

                dataView.setUint16(7, join - 1, true);
                client.write(djoin);
                client.write(djoin);
            },
            pulse: (join) => {
                let djoin = new Uint8Array([0x05, 0x00, 0x06, 0x00, 0x00, 0x03, 0x27, 0x00, 0x00]);
                let dataView = new DataView(djoin.buffer);
                dataView.setUint16(7, join - 1 | 0x8000, true);
                client.write(djoin);
                dataView.setUint16(7, join - 1, true);
                client.write(djoin);
            },
            aget: (join) => {
                return analog[join];
            },
            dget: (join) => {
                return digital[join];
            },
            subscribe: (callback) => {
                cipEvents.on("data", (data) => {
                    callback(data);
                });
            }
        }
    }
}
