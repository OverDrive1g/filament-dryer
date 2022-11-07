const BME280_ADDRESS = 0x76;

/**
 * Convert two UInt8 value into one "signed" number
 * @param data
 * @param offs
 * @returns
 */
function convS16(data: Uint8Array, offs: number): number {
  var value = (data[offs + 1] << 8) + data[offs];
  if (value & 0x8000) value -= 65536;
  return value;
}

export class BME280 {
  private dT: [undefined, number, number, number];
  private dP: [
    undefined,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
  ];
  private dH: [undefined, number, number, number, number, number, number];

  private pres_raw: number;
  private temp_raw: number;
  private hum_raw: number;

  private t_fine: number;
  constructor(
    private read: (register: number, length: number) => Uint8Array,
    private write: (register: number, data: number) => void
  ) {
    const osrs_t = 1; //Temperature oversampling x 1
    const osrs_p = 1; //Pressure oversampling x 1
    const osrs_h = 1; //Humidity oversampling x 1
    const mode = 3; //Normal mode
    const t_sb = 5; //Tstandby 1000ms
    const filter = 0; //Filter off
    const spi3w_en = 0; //3-wire SPI Disable

    var ctrl_meas_reg = (osrs_t << 5) | (osrs_p << 2) | mode;
    var config_reg = (t_sb << 5) | (filter << 2) | spi3w_en;
    var ctrl_hum_reg = osrs_h;

    this.write(0xf2, ctrl_hum_reg);
    this.write(0xf4, ctrl_meas_reg);
    this.write(0xf5, config_reg);

    this.readCoefficients();
  }
  setPower(on: any) {
    var r = this.read(0xf4, 1)[0]; // ctrl_meas_reg
    if (on) r |= 3; // normal mode
    else r &= ~3; // sleep mode
    this.write(0xf4, r);
  }
  /**
   * Read and store all coefficients stored in the sensor
   */
  readCoefficients() {
    var data = new Uint8Array(24 + 1 + 7);
    data.set(this.read(0x88, 24), 0);
    data.set(this.read(0xa1, 1), 24);
    data.set(this.read(0xe1, 7), 25);
    this.dT = [
      ,
      /*empty element*/ (data[1] << 8) | data[0],
      convS16(data, 2),
      convS16(data, 4),
    ];
    this.dP = [
      ,
      /*empty element*/ (data[7] << 8) | data[6],
      convS16(data, 8),
      convS16(data, 10),
      convS16(data, 12),
      convS16(data, 14),
      convS16(data, 16),
      convS16(data, 18),
      convS16(data, 20),
      convS16(data, 22),
    ];
    this.dH = [
      ,
      /*empty element*/ data[24],
      convS16(data, 25),
      data[27],
      (data[28] << 4) | (0x0f & data[29]),
      (data[30] << 4) | ((data[29] >> 4) & 0x0f),
      data[31],
    ];
  }
  /**
   * Read Raw data from the sensor
   */
  readRawData() {
    var data = this.read(0xf7, 8);
    this.pres_raw = (data[0] << 12) | (data[1] << 4) | (data[2] >> 4);
    this.temp_raw = (data[3] << 12) | (data[4] << 4) | (data[5] >> 4);
    this.hum_raw = (data[6] << 8) | data[7];
  }
  /**
   * Calibration of Temperature, algorithm is taken from the datasheet
   * @param adc_T
   * @returns
   */
  calibration_T(adc_T: number) {
    var var1, var2, T;
    var dT = this.dT;
    var1 = (adc_T / 16384.0 - dT[1] / 1024.0) * dT[2];
    var2 =
      (adc_T / 131072.0 - dT[1] / 8192.0) *
      (adc_T / 131072.0 - dT[1] / 8192.0) *
      dT[3];
    this.t_fine = var1 + var2;
    T = (var1 + var2) / 5120.0;
    return T * 100;
  }
  /**
   * Calibration of Pressure, algorithm is taken from the datasheet
   * @param adc_P
   * @returns
   */
  calibration_P(adc_P: number) {
    var var1, var2, p;
    var dP = this.dP;
    var1 = this.t_fine / 2.0 - 64000.0;
    var2 = (var1 * var1 * dP[6]) / 32768.0;
    var2 = var2 + var1 * dP[5] * 2.0;
    var2 = var2 / 4.0 + dP[4] * 65536.0;
    var1 = ((dP[3] * var1 * var1) / 524288.0 + dP[2] * var1) / 524288.0;
    var1 = (1.0 + var1 / 32768.0) * dP[1];
    if (var1 === 0.0) {
      return 0; // avoid exception caused by division by zero
    }
    p = 1048576.0 - adc_P;
    p = ((p - var2 / 4096.0) * 6250.0) / var1;
    var1 = (dP[9] * p * p) / 2147483648.0;
    var2 = (p * dP[8]) / 32768.0;
    p = p + (var1 + var2 + dP[7]) / 16.0;
    return p;
  }
  /**
   * Calibration of Humidity, algorithm is taken from the datasheet
   * @param adc_H
   * @returns
   */
  calibration_H(adc_H: number) {
    var v_x1;
    var dH = this.dH;
    v_x1 = this.t_fine - 76800;
    v_x1 =
      (((adc_H << 14) - (dH[4] << 20) - dH[5] * v_x1 + 16384) >> 15) *
      (((((((v_x1 * dH[6]) >> 10) * (((v_x1 * dH[3]) >> 11) + 32768)) >> 10) +
        2097152) *
        dH[2] +
        8192) >>
        14);
    v_x1 = v_x1 - (((((v_x1 >> 15) * (v_x1 >> 15)) >> 7) * dH[1]) >> 4);
    v_x1 = E.clip(v_x1, 0, 419430400);
    return v_x1 >> 12;
  }
  getData() {
    this.readRawData();
    return {
      temp: this.calibration_T(this.temp_raw) / 100.0,
      pressure: this.calibration_P(this.pres_raw) / 100.0,
      humidity: this.calibration_H(this.hum_raw) / 1024.0,
    };
  }
  static connectBME280(i2c: I2C, options: { addr?: number }) {
    let addr = !options.addr ? BME280_ADDRESS : options.addr;

    return new BME280(
      function (reg, len) {
        // read
        i2c.writeTo(addr, [reg]);
        return i2c.readFrom(addr, len);
      },
      function (reg, data) {
        // write
        i2c.writeTo(addr, [reg, data]);
      }
    );
  }
}
