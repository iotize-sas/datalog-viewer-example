import { LoadingController, ToastController, Events } from '@ionic/angular';
import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { BleService, DiscoveredDeviceType } from './../iotize/ble/ble.service';
import { Subscription } from 'rxjs';
import { ResultCodeTranslation } from '@iotize/device-client.js/client/api/response';
import { DeviceService } from '../iotize/device/device.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss']
})
export class HomePage implements OnInit, OnDestroy {

  private devicesSubscription: Subscription;
  devices: Array<DiscoveredDeviceType> = [];

  constructor(public ble: BleService,
              public deviceService: DeviceService,
              public changeDetector: ChangeDetectorRef,
              public loadingCtrl: LoadingController,
              public toastCtrl: ToastController,
              public events: Events) {}

  ngOnInit(): void {
    this.devicesSubscription = this.ble.devicesObservable()
    .subscribe((device) => {
      if (this.devices.map((entry) => entry.address).indexOf(device.address) >= 0) {
        return;
      } else {
        console.log('device.address:', device.address, 'not found in devices');
        console.log(this.devices);
      }
      this.devices.push(device);
      this.changeDetector.detectChanges();
    }, (error) => {
      console.error(error);
    });
    this.events.subscribe('disconnected', () => this.changeDetector.detectChanges());
    this.events.subscribe('needChangeDetection', () => this.changeDetector.detectChanges());
    this.events.subscribe('connected', async() => {
      await this.deviceService.getDatalog();
      this.changeDetector.detectChanges();
    });
  }

  async connect(device: DiscoveredDeviceType) {
    console.log(`connect to ${device.name}`); 
    const loader = await this.loadingCtrl.create({
      message: 'connecting'
    });
    loader.present();
    try {
      await this.ble.onConnect(device.address);
      loader.dismiss();
    } catch (error) {
      loader.dismiss();
      this.showError(error);
    }
    this.changeDetector.detectChanges();
  }

  async disconnect() {
    const loader = await this.loadingCtrl.create({
      message: 'disconnecting',
    });
    loader.present();
    try {
      await this.ble.disconnect();
    } catch (error) {
      console.error(error);
      this.showError(error);
    }
    loader.dismiss();
    console.log(this.ble.selectedDevice);
    this.changeDetector.detectChanges();
  }

  ngOnDestroy(): void {
    this.devicesSubscription = null;
  }

  toggleScan() {
    if (this.ble.isScanning) {
      this.ble.stopScan();
      return;
    }
    this.devices = this.devices.filter(device => device.address === this.ble.selectedDevice);
    this.ble.startScan();
  }

  async showToast(message: string, duration: number = 3000): Promise<void> {
    const toast = await this.toastCtrl.create({
      message: message,
      duration: duration,
      showCloseButton: duration === 0
    });

    toast.present();
  }

  showError(error) {
    if (ResultCodeTranslation[error] !== undefined) {
      this.showToast(`Error: device responded ${ResultCodeTranslation[error]}`, 0);
    } else {
      this.showToast(`Error: device responded ${error.message ? error.message : error}`, 0);
    }
  }
}
