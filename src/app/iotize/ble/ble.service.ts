import { Observable } from 'rxjs';
import { DeviceService } from './../device/device.service';
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { BLEComProtocol } from '@iotize/cordova-plugin-iotize-ble';
import { Events } from '@ionic/angular';

declare var iotizeBLE: any;

export interface DiscoveredDeviceType {
  name: string;
  address: string;
  rssi?: number;
}

@Injectable({
  providedIn: 'root'
})
export class BleService {

  selectedDevice = '';
  isScanning = false;
  devices$: Subject<DiscoveredDeviceType>;

  constructor(public deviceService: DeviceService,
    public events: Events) {
    this.devices$ = new Subject<DiscoveredDeviceType>();
  }

  async startScan() {

    console.log('Checking BLE Availability ...');

    try {
      await this.checkAvailable();
    } catch (error) {
      console.error(error);
      return;
    }

    console.log('Start Scanning ...');

    iotizeBLE.startScan((result) => {
      console.log(result);
      this.isScanning = true;
      if (result === 'Ok') return;
      
      this.devices$.next(result);
      // this.devices$.next(JSON.parse(result));
    }, (error) => {
      iotizeBLE.getLastError((lasterror) => {
        console.log('error ' + lasterror);
        this.isScanning = false;
        this.events.publish('needChangeDetection');
      });
    });
  }

  checkAvailable(): Promise<void> {
    return new Promise((resolve, reject) => {
      iotizeBLE.checkAvailable((val) => {
        console.log(val);
        val ? resolve() : reject('BlueTooth is not on and ready to use');
        },
      (err) => {
        console.error(err);
        reject(err);
      });
    });
  }

  /**
   * Gets the observable on the devices$ Subject
   * @return {Observable<DiscoveredDeviceType>}
   */

  devicesObservable(): Observable<DiscoveredDeviceType> {
    return this.devices$.asObservable();
  }

  stopScan() {
    console.log('Stop Scanning ...');
    this.isScanning = false;

    iotizeBLE.stopScan((result) => {
       console.log(result);
       this.isScanning = false;
       this.events.publish('needChangeDetection');
      },
      (error) => {
         console.log('failed : ' + error);
        });
  }

  async connectTo(deviceAddress: string) {
    try {
      console.log('trying to connect to ' + deviceAddress);
      await this.deviceService.init(new BLEComProtocol(deviceAddress));
      console.log('connected!');
      console.log('SN: ' + await this.deviceService.getSerialNumber());
      this.selectedDevice = deviceAddress;

    } catch (exception) {
      console.error('connection failed, disconnecting...');
      await this.deviceService.disconnect();
      throw exception;
    }
  }

  async  onConnect(item: string) {

    try {
      if (this.isScanning) {
        this.stopScan();
      }
      if (this.selectedDevice !== '') {
        console.log('already connected to: ' + this.selectedDevice);
        await this.disconnect();
      }

      await this.connectTo(item);

    } catch (error) {
      console.error(error);
      this.deviceService.clear();
      throw error;
    }
  }

  async disconnect() {
    try {
      await this.deviceService.disconnect();
    } catch (error) {
      console.error(error);
      throw error;
    }
    this.selectedDevice = '';
  }
}