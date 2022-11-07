export class HD44780 {
  constructor(private write: (x: any, c: undefined | any) => void) {
    this.write(0x33, 1);
    this.write(0x32, 1);
    this.write(0x28, 1);
    this.write(0x0c, 1);
    this.write(0x06, 1);
    this.write(0x01, 1);
  }
  clear() {
    this.write(0x01, 1);
  }
  print(str: string) {
    for (var i = 0; i < str.length; i++)
      this.write(str.charCodeAt(i), undefined);
  }
  cursor(block: any) {
    this.write(block ? 0x0f : 0x0e, 1);
  }
  setCursor(x: any, y: any) {
    const l = [0x00, 0x40, 0x14, 0x54];
    this.write(0x80 | (l[y] + x), 1);
  }
  createChar(ch: any, data: any) {
    this.write(0x40 | ((ch & 7) << 3), 1);
    for (var i = 0; i < 8; i++) this.write(data[i], undefined);
    this.write(0x80, 1);
  }
  static connect(i2c: I2C, addr: any) {
    return new HD44780(function (x, c) {
      var a = (x & 0xf0) | 8 | (c === undefined ? 1 : 0);
      var b = ((x << 4) & 0xf0) | 8 | (c === undefined ? 1 : 0);
      i2c.writeTo(addr || 0x27, [
        a,
        a,
        a | 4,
        a | 4,
        a,
        a,
        b,
        b,
        b | 4,
        b | 4,
        b,
        b,
      ]);
    });
  }
}
