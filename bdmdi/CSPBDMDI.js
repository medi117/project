const app = require("express")();
const io = require("socket.io");
const { MerkleTree } = require("merkletreejs");
const SHA256 = require("crypto-js/sha256");
const { readData } = require("../utils/utils");

class CSP {
	constructor() {
		this.dataOwners = [];
	}
	/**
	 * Starts the server, to listen to incoming requests.
	 * The source code for the rest of the steps done by the CSP
	 * are not implemented, because whether it took 1ms or 1 day, it won't
	 * affect the execution time of the data owner.
	 */
	startServer() {
		this.server = app.listen(3000);
		this.ioServer = io(this.server, {
			maxHttpBufferSize: 10 * 1e8,
		});
		console.log("Server is started");
		this.ioServer.on("connection", (peerSocket) => {
			peerSocket.on("PUBLIC_KEY", ({ publicKey, dataOwnerId }) => {
				console.log(`Data owner ID: ${dataOwnerId}`);
				console.log(`Data owner public key: ${publicKey}`);
			});
			peerSocket.on("OUTSOURCING", ({ fileId, data, signatures }) => {
				console.log(`The file ID: ${fileId}`);
				console.log(`The data was ${data ? "" : "not"} received.`);
				console.log(
					`The signatures was ${signatures ? "" : "not"} received.`
				);
			});
			peerSocket.on("CHALLENGE", ({ challenge }, callback) => {
				const dataBlocks = readData("../files/data.txt");
				let tags = [];
				for (const block of dataBlocks) {
					let tag = SHA256(block).toString();
					tags.push(tag);
				}
				const tree = new MerkleTree(tags, SHA256);
				const proof = tree.getProof(challenge);
				callback({ proof });
			});
		});
	}
}

/**
 * Execution starts from here
 */
(async () => {
	/**
	 * Create an instance of the Cloud Storage Provider.
	 */
	const csp = new CSP();

	/**
	 * Starts the server.
	 */
	csp.startServer();
})().catch((err) => {
	console.error(err);
});
