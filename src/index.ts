import { BME280 } from "./modules/BME280";
import { HD44780 } from "./modules/HD44780";

function main() {
  I2C1.setup({ scl: 22 as any, sda: 21 as any });
  let sensor = BME280.connectBME280(I2C1, { addr: 0x76 });
  let screen = HD44780.connect(I2C1, 0x27);
  let interval = setInterval(() => {
    screen.clear();
    let d = sensor.getData();
    screen.print("T=" + ~~d.temp);
    screen.print(" P=" + ~~d.pressure);
    screen.print(" H=" + ~~d.humidity);
  }, 1000);
}
main();
