const cryptoRandomString = require("crypto-random-string");
const fileName = "../files/random-bytes8.txt";

const fileSize = Number(process.argv[2]); //MB
const fs = require("fs");
let str = "";
for (let i = 0; i < (fileSize >= 512 ? 256 : fileSize); i++) {
	str = str + cryptoRandomString({ length: 64 * 16384, type: "hex" }) + "\n";
}
fs.writeFileSync(fileName, str);
if (fileSize >= 512) {
	fs.appendFileSync(fileName, "\n" + str);
	if (fileSize > 512) {
		fs.appendFileSync(fileName, "\n" + str);
		fs.appendFileSync(fileName, "\n" + str);
	}
}
