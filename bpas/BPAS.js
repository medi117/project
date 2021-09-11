const SHA256 = require("crypto-js/sha256");
const ioClient = require("socket.io-client");
const eccrypto = require("eccrypto");
const { MerkleTree } = require("merkletreejs");
const { v4: uuidv4 } = require("uuid");
const level = require("level");
const sublevel = require("level-sublevel");
const {
	resetTime,
	saveBlockchain,
	readBlockchain,
	calculateTime,
	writeData,
	readData,
} = require("../utils/utils");
const db = sublevel(
	level("../db/", {
		valueEncoding: "json",
	})
);
const blockchain = db.sublevel("blockchain");
let start = 0;
class Transaction {
	constructor(ID, data, timestamp) {
		this.ID = ID;
		this.data = data;
		this.timestamp = timestamp;
	}
	toString() {
		return this.ID + ":" + this.data + ":" + this.timestamp;
	}
}

class Block {
	constructor(index, timestamp, transactions, previousHash = "") {
		this.metaData = {
			index,
			timestamp,
			previousHash,
			hash: this.calculateHash(index, timestamp, transactions, previousHash),
		};
		this.transactions = transactions;
	}
	calculateHash(index, timestamp, transactions, previousHash) {
		return SHA256(
			index + ":" + timestamp + ":" + transactions + ":" + previousHash
		).toString();
	}
	toString() {
		return this.transactions;
	}
}
class Blockchain {
	constructor() {
		this.chain = [new Block(0, Date.now(), [])];
	}

	getTheLatestBlock() {
		return this.chain[this.chain.length - 1];
	}

	addBlock(block) {
		block.metaData = {
			previousHash: this.getTheLatestBlock().hash,
			hash: block.calculateHash(),
			timestamp: Date.now(),
		};
		this.chain.push(block.toString());
	}
	toString() {
		return JSON.stringify(this.chain);
	}
}
class DataOwner {
	constructor() {
		this.blockchain = new Blockchain();
		this.files = [];
		this.tags = [];
		this.signatures = [];
		this.dataBlocks = [];
		this.encryptedBlocks = [];
	}

	connectToCSP() {
		return new Promise((resolve) => {
			this.socket = ioClient.connect("http://127.0.0.1:3000");
			this.socket.once("connect", () => {
				resolve();
			});
		});
	}

	async generateTags() {
		/**
		 * 1 - Split file into data blocks of fixed size.
		 */
		this.dataBlocks = readData(
			`../files/random-bytes${Number(process.argv[2])}.txt`
		);

		/**
		 * 2 - Encrypt data blocks.
		 */
		for (const block of this.dataBlocks) {
			let encryptedBlock = await eccrypto.encrypt(
				this.publicKey,
				Buffer.from(block, "hex")
			);
			this.encryptedBlocks.push({
				iv: encryptedBlock.iv.toString("hex"),
				ciphertext: encryptedBlock.ciphertext.toString("hex"),
				mac: encryptedBlock.mac.toString("hex"),
				ephemPublicKey: encryptedBlock.ephemPublicKey.toString("hex"),
			});
		}

		/**
		 * 3 - Generate tags for these encrypted blocks.
		 */
		for (const encryptedBlock of this.encryptedBlocks) {
			this.tags.push(SHA256(encryptedBlock.ciphertext).toString());
		}

		/**
		 * 4 - Sign the encrypted blocks.
		 */
		for (const encryptedBlock of this.encryptedBlocks) {
			this.signatures.push(
				await eccrypto.sign(
					this.privateKey,
					Buffer.from(SHA256(encryptedBlock.ciphertext).toString(), "hex")
				)
			);
		}

		/**
		 * 4.5 - Generate ID for data file and save it locally,
		 *  along with the root of the merkle tree.
		 */
		this.fileId = uuidv4();
		this.tree = new MerkleTree(this.tags, SHA256);
		this.root = this.tree.getRoot().toString("hex");
		this.files.push({ fileId: this.fileId, root: this.root });

		/**
		 * 5 - Outsource fileId + encrypted blocks + signatures.
		 */
		await this.connectToCSP();
		try {
			this.socket.emit("OUTSOURCING", {
				fileId: this.fileId,
				data: this.encryptedBlocks,
				signatures: this.signatures,
			});
		} catch (err) {}

		/**
		 * 6 - Store tags on the blockchain.
		 */
		let blockTags = [];
		for (let index = 0; index < this.tags.length; index += 10) {
			blockTags.push(
				this.tags.slice(
					index,
					index + 10 <= this.tags.length ? index + 10 : this.tags.length
				)
			);
		}
		blockTags.forEach((tags) => {
			let transactions = tags.map((tag) =>
				new Transaction(uuidv4(), tag, Date.now()).toString()
			);
			this.blockchain.addBlock(
				new Block(
					this.blockchain.chain.length,
					Date.now(),
					JSON.stringify(transactions)
				)
			);
		});

		await saveBlockchain(blockchain, this.fileId, this.blockchain);
		calculateTime("Phase 1: ", Date.now() - start, true);
		writeData(
			this.encryptedBlocks.map((encryptedBlock) =>
				JSON.stringify(encryptedBlock)
			),
			"../files/data.txt"
		);
		/**
		 * End of the phase 01.
		 */
	}

	async phaseOne() {
		start = Date.now();

		/**
		 * Generate data owner credentials (ID,
		 * Public and private key pairs).
		 */
		this.Id = uuidv4();
		this.privateKey = eccrypto.generatePrivate();
		this.publicKey = eccrypto.getPublic(this.privateKey);

		/**
		 * Send Public key to the Cloud Storage Provider
		 */
		await this.connectToCSP();
		this.socket.emit("PUBLIC_KEY", {
			dataOwnerId: this.Id,
			publicKey: this.publicKey.toString("hex"),
		});

		await this.generateTags();
	}

	async phaseTwo() {
		/**
		 * 1 - Send file ID to the Cloud Storage Provider.
		 */
		resetTime();
		start = Date.now();
		/**
		 * 2 - Restore the tags from the blockchain.
		 */
		const { data: storedBlockchain } = await readBlockchain(
			blockchain,
			this.fileId
		);
		calculateTime(null, Date.now() - start, false);
		await this.connectToCSP();
		this.socket.emit(
			"CHALLENGE",
			{
				fileId: this.fileId,
			},
			async ({ rootCSP }) => {
				start = Date.now();
				/**
				 * 3 - Use the retrieved tags to build
				 * 		 the merkle tree and generate the root.
				 */
				let chain = storedBlockchain.chain;
				chain.shift();
				chain = chain
					.map((block) =>
						block
							.split(",")
							.map((transaction) => transaction.split(":"))
							.map((element) => element[0])
					)
					.flat();
				const tree = new MerkleTree(chain, SHA256);
				const rootDO = tree.getRoot().toString("hex");

				/**
				 * 4 - Compare the generated root with the Cloud
				 *     Storage Provider root.
				 */
				console.log(`Is the data intact: ${rootDO === rootCSP}`);
				calculateTime("Phase 2: ", Date.now() - start, true);
			}
		);
	}
}
(async () => {
	/**
	 * Create an instance of a data owner.
	 */
	const dataOwner = new DataOwner();

	/**
	 * Execution of the Phase one (Outsourcing phase).
	 */
	await dataOwner.phaseOne();

	/**
	 * Execution of the phase two (challenging phase).
	 */
	await dataOwner.phaseTwo();
})().catch((err) => {
	console.error(err);
});
