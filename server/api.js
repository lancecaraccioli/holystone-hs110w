var WebSocketServer = require('ws').Server
  , wss = new WebSocketServer({port: 8070});

const net = require('net');
const dgram = require('dgram');
const ip = require('ip');
const udpClient = dgram.createSocket('udp4');
const tcpClient = new net.Socket();
//todo get from some future configuration object or dynamically
const gatewayIp = '192.168.0.1';
const tcpPort = 8080;
const udpPort = 8080;
const Stream = require('node-rtsp-stream');

stream = new Stream({
  name: 'name',
  streamUrl: 'rtsp://192.168.0.1/0',
  wsPort: 8090
});

wss.on('connection', function connection(ws) {
  tcpClient.connect(tcpPort, gatewayIp, () => {
    console.log('Connected. my address: ' + ip.address());
  });

  tcpClient.on('data', function (data) {
    //console.log('Received: ' + data);
  });

  tcpClient.on('error', function (error) {
    console.log('error:', error);

  });

  tcpClient.on('close', function () {
    console.log('Connection closed');
  });

  var wasError = false;
  udpClient.on('error', (err) => {
    console.log(`client error:\n${err.stack}`);
    wasError = true;
    udpClient.close();
  });

  udpClient.on('message', (msg, rinfo) => {
    console.log(`client got: ${msg} from ${rinfo.address}:${rinfo.port}`);
  });

  udpClient.on('listening', () => {
    var address = udpClient.address();
    console.log(`client listening ${address.address}:${address.port}`);
  });

  tcpClient.write('remote\r\n');
  const COMMANDS = {
    UNKNOWN_HEADER_0: 0,
    UNKNOWN_HEADER_1: 1,
    LIFT: 2,
    TURN: 3,
    ADVANCE: 4,
    STRAFE: 5,
    YAW: 6,
    PITCH: 7,
    ROLL: 8,
    THROTTLE: 9,
    CHECK_SUM: 10
  };

  /**
   * These are the flight commands. They are sent as a
   * byte array via UDP
   *
   * Aircraft principal axes. ...
   * - An aircraft in flight is free to rotate in three dimensions:
   * -- pitch, nose up or down about an axis running from wing to wing;
   * -- yaw, nose left or right about an axis running up and down;
   * -- roll, rotation about an axis running from nose to tail.
   * @type {[*]}
   */
  var commandSettings = [
    0xff,//unknown header sent with apparently constant value
    0x04,//unknown header sent with apparently constant value
    0x7f,//vertical lift up/down
    0x3f,//rotation rate left/right
    0xc0,//advance forward / backward
    0x3f,//strafe left / right
    0x90,//yaw (used as a setting to trim the yaw of the uav)
    0x10,//pitch (used as a setting to trim the pitch of the uav)
    0x10,//roll (used as a setting to trim the roll of the uav)
    0x40,//throttle
    0x00,//this is a sanity check; 255 - ((sum of flight controls from index 1 to 9) % 256)
  ];

  function checkSum() {
    var sum = 0, i;
    for (i = 1; i <= 9; i++) {
      sum += commandSettings[i];
    }
    return 255 - (sum % 256)
  }

  commandSettings[COMMANDS.CHECK_SUM] = checkSum();

  function startFlightCommandLoop() {
    console.log('start flight commands');
    var identifyAsRemoteWhenZero = 0;
    var remoteControlLoop = setInterval(function () {
      identifyAsRemoteWhenZero = identifyAsRemoteWhenZero % 5;
      if (identifyAsRemoteWhenZero === 0) {
        tcpClient.write('remote\r\n');
      }
      //console.log('sending commands: ', commandSettings);
      udpClient.send(Buffer.from(commandSettings), udpPort, gatewayIp, (err) => {

        if (err) {
          console.log('An error occurred:', err);
          wasError = true;
          clearInterval(remoteControlLoop);
        }
      });

      identifyAsRemoteWhenZero++;
    }, 20);
    return function stopFlightCommandLoop() {
      console.log('stop flight commands');
      clearInterval(remoteControlLoop);
    };
  }

  var stopSendingCommands = function () {};
  ws.on('message', function incoming(message) {
    message = JSON.parse(message);
    if (message.type === 'flight') {
      var commands = message.args;
      //console.log('commands:', commands);
      Object.keys(commands).forEach((key) => {
        if (!key) {
          return;
        }
        var KEY = key.toUpperCase();

        if (!COMMANDS[KEY]) {
          return;
        }
        //console.log(`setting ${KEY} to ${commands[key]}`);
        commandSettings[COMMANDS[KEY]] = commands[key];
      });
      commandSettings[COMMANDS.CHECK_SUM] = checkSum();
    } else if (message.type === 'enabled') {
      console.log('message type enabled:', message);
      if (message.args.enabled) {
        console.log('enabled so start loop');
        stopSendingCommands = startFlightCommandLoop();
      } else {
        console.log('disabled so stop loop');
        stopSendingCommands();
      }
    } else if (message.type === 'video') {
      if (message.args.enabled) {
        console.log('begin recording');
        tcpClient.write('begin ' + Date.now() + '\r\n');
      } else {
        console.log('end recording');
        tcpClient.write('end\r\n');
      }
    }

  });

  ws.send('ACK');
});






