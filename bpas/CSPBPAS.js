const app = require("express")();
const io = require("socket.io");
const { MerkleTree } = require("merkletreejs");
const SHA256 = require("crypto-js/sha256");
const { readByLine, readData } = require("../utils/utils");

class CSP {
	/**
	 * Starts the server, to listen to incoming requests.
	 * The source code for the rest of the steps done by the CSP
	 * are not implemented, because whether it took 1ms or 1 day, it won't
	 * affect the execution time of the data owner.
	 */
	startServer() {
		this.server = app.listen(3000);
		this.ioServer = io(this.server);
		console.log("Server is started");
		this.ioServer.on("connection", (peerSocket) => {
			peerSocket.on("PUBLIC_KEY", ({ dataOwnerId, publicKey }) => {
				console.log(`Data owner ID: ${dataOwnerId}`);
				console.log(`Data owner public key: ${publicKey}`);
			});
			peerSocket.on("OUTSOURCING", ({ fileId }) => {
				console.log(`The file ID: ${fileId}`);
			});
			peerSocket.on("CHALLENGE", (_, callback) => {
				let encryptedBlocks = readData("../files/data.txt");
				let tags = [];
				for (const encryptedBlock of encryptedBlocks.map((encryptedBlock) =>
					JSON.parse(encryptedBlock)
				)) {
					tags.push(SHA256(encryptedBlock.ciphertext).toString());
				}
				const tree = new MerkleTree(tags, SHA256);
				const rootCSP = tree.getRoot().toString("hex");
				callback({ rootCSP });
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
