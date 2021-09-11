const app = require("express")();
const io = require("socket.io");
const SHA256 = require("crypto-js/sha256");
const { readData } = require("../utils/utils");

class CSP {
	constructor() {
		this.dataOwners = [];
	}
	startServer() {
		this.server = app.listen(3000);
		this.ioServer = io(this.server);
		console.log("Server is started");
		this.ioServer.on("connection", (peerSocket) => {
			peerSocket.on("PUBLIC_KEY", ({ publicKey, dataOwnerId }) => {
				console.log(`Data owner ID: ${dataOwnerId}`);
				console.log(`Data owner public key: ${publicKey}`);
			});
			peerSocket.on("OUTSOURCING", ({ fileId }) => {
				console.log(`The file ID: ${fileId}`);
			});
			peerSocket.on("CHALLENGE", async (_, callback) => {
				const data = readData("../files/data.txt");
				let tags = [];
				for (const block of data) {
					let tag = SHA256(block).toString();
					tags.push(tag);
				}
				callback({ tags });
			});
		});
	}
}

(async () => {
	const csp = new CSP();
	csp.startServer();
})().catch((err) => {
	console.error(err);
});
