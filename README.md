# crestron-home-assistant
Connects Crestron controllers to Home Assistant via a Node JS Webserver

# Crestron Controller Setup

This node js server mimics a crestron panel, in your controller, assign one of your IP ID's to an XPanel, which this node js server will be sending and recieving from

When creating analog sliders / inputs on your touch panels, keep the maxmium value to 255, since anything higher breaks the plugin, use the `Ranges` option on your entites in `configuration.json` to convert the value to a different range.

# Setup
Download project source, and extract the files to a memorable destination.

Edit configuration.json to match your Home Assistant server, and your Crestron Controller

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

Join Types:
```
D = Digital (true or false)
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
            "AutoUpdate": "HomeAssistant", -- Should the state of the device update when the node js server restarts? if so from which source (Crestron not supported yet)
            "switch": "D3", -- Which join to link to the switch D = Digtial, 3 = Join ID
            "switchtype": "pulse" -- What type of value does the node js server expect from crestron, pulse is for digital joins direct from a button, toggle is for joins that go through a toggle gate
        },
"light.example": {
            "Type": "light",
            "AutoUpdate": "HomeAssistant",
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
            "AutoUpdate": "HomeAssistant",
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

![image](https://github.com/user-attachments/assets/1392181a-5d72-4af2-8270-e99dcb7426f5)
