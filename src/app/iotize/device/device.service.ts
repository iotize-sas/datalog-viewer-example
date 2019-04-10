import { Injectable } from '@angular/core';
import { IoTizeDevice, SessionState } from '@iotize/device-client.js/device';
import { ComProtocol } from '@iotize/device-client.js/protocol/api';
import { Events } from '@ionic/angular';
import { SinglePacket } from '@iotize/device-client.js/device/model';
import { NumberConverter, FloatConverter } from '@iotize/device-client.js/client/impl';

@Injectable({
  providedIn: 'root'
})
export class DeviceService {

  isReady = false;
  device: IoTizeDevice;
  connectionPromise = null;
  session?: SessionState = null;
  timeOffset: number;

  variableConfigMap = [
    {id: 1,
      name: 'Voltage_V',
      converter: FloatConverter.instance32()},
      
    {id: 2,
      name: 'Temperature_C',
      converter: FloatConverter.instance32()},

    {id: 4,
      name: 'Count',
      converter: NumberConverter.uint32Instance()},

    {id: 7,
      name: 'LEDStatus',
      converter: NumberConverter.uint8Instance()},

  ]

  datalogCount = 0;
   datalogPackets: SinglePacket[] = [];
  parsedDataLogPackets: { bundleId: number; variables: any[]; }[];

  get isLogged(): boolean {
    if (this.session) {
      return this.session.name !== 'anonymous';
    }
    return false;
  }

  constructor(public events: Events) { }

  async getDatalog() {

    console.log('getting datalog');
    this.datalogCount = (await this.device.service.datalog.getPacketCount()).body();
    this.datalogPackets = [];
    
    for (let i =0; i < this.datalogCount; i++) {
      this.datalogPackets.push(
        (await this.device.service.datalog.dequeueOnePacket()).body()
      );
      if (i == 0 && this.datalogPackets[0]) {
        this.timeOffset = Date.now() - this.datalogPackets[0].sendTime * 1000; // Synchronize on first datalog. sendTime is in seconds
      }
    }
    console.log(this.datalogPackets);
    console.log('decoding datalog payload');
    this.parsedDataLogPackets = this.datalogPackets.map(packet => this.parsingDatalog(packet));
    
    
  }


  async init(protocol: ComProtocol) {
    this.isReady = false;
    try {
      this.device = IoTizeDevice.create();
      console.log('device created');
      this.connectionPromise = this.connect(protocol);
      console.log('waiting for connection promise');
      await this.connectionPromise;
      await this.checkSessionState();
      this.isReady = true;
      this.events.publish('connected');
    } catch (error) {
      console.error('init failed');
      console.error(error);
      throw new Error('Connection Failed: ' + (error.message? error.message : error));
    }
  }

  connect(protocol: ComProtocol): Promise<void> {
    return this.device.connect(protocol);
  }

  async disconnect(): Promise<void> {
    try {
      this.isReady = false;
      await this.device.disconnect();
      await this.checkSessionState();
      this.events.publish('disconnected');
    } catch (error) {
      console.log(error);
      this.events.publish('disconnected');
      throw (error);
    }
  }

  async getSerialNumber(): Promise<string> {
    return (await this.device.service.device.getSerialNumber()).body();
  }

  clear() {
    this.isReady = false;
    this.device = null;
  }

  async login(user: string, password: string): Promise<boolean> {
    try {
      console.log('trying to log as ', user);
      const logSuccess = await this.device.login(user, password);
      if (logSuccess) {
        await this.checkSessionState();
      }
      return logSuccess;
    } catch (error) {
      throw error;
    }
  }

  async logout(): Promise<boolean> {
    try {
      await this.device.logout();
    } catch (error) {
      return false;
    }
    try {
      await this.checkSessionState();
      return true;
    } catch (error) {
      return false;
    }
  }

  async checkSessionState() {
    if (!this.device.isConnected()) {
      this.session = null;
      return;
    }
    const previouslyConnectedProfile = this.session? this.session.name : '';
    this.session = await this.device.refreshSessionState();
    if (previouslyConnectedProfile !== ''){ // not the first sessionState
      if (this.session.name === 'anonymous') {
        this.events.publish('logged-out');
      } else if (previouslyConnectedProfile !== this.session.name){
        this.events.publish('logged-in', this.session.name);
      }
    } 
  }

  parsingDatalog(dataLog: SinglePacket) {
    let time = Date.now()
    let data = dataLog.data;
    let variables = [];
    let i = 3;
    while (i < data.length) {
      let variable:any = {};
      let variableDataLength;
      variable.id = data[i+1];
      switch (data[i]) { // First Byte: type. Second Byte Id. Third and more: variableData
        case 193:
          variableDataLength = 1;
          i += 2; // Align with first variableData Byte
          variable.data = data.slice(i,i+variableDataLength);
          i+= variableDataLength;
          break;
        case 196:
          variableDataLength = 4;
          i += 2; // Align with first variableData Byte
          variable.data = data.slice(i,i+variableDataLength);
          i+= variableDataLength;
          break;
      }
      const variableConfig = this.variableConfigMap.find(variableConfig => variableConfig.id === variable.id);
      variable.name = variableConfig.name;
      variable.value = variableConfig.converter.decode(variable.data); // Converts Buffer to a value according to variableConfig
      variables.push(variable);
    }

    return {
      bundleId: data[1],
      variables: variables,
      logTime: new Date(dataLog.logTime * 1000 + this.timeOffset) // Seconds to milli
    }
  }
}
