const SHA256 = require("crypto-js/sha256");
const ioClient = require("socket.io-client");
const eccrypto = require("eccrypto");
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
		return this.ID + "#" + this.data + "#" + this.timestamp;
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
		this.dataBlocks = [];
		this.tags = [];
		this.encryptedBlocks = [];
		this.signatures = [];
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
		 * 2 - Encrypt the data blocks.
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
		 * 3 - Generate ID for the file and sign the
		 *     encrypted blocks.
		 */
		this.fileId = uuidv4();
		for (const encryptedBlock of this.encryptedBlocks) {
			let signature = await eccrypto.sign(
				this.privateKey,
				Buffer.from(
					SHA256(
						this.ID +
							this.publicKey.toString("hex") +
							this.fileId +
							encryptedBlock.ciphertext.toString("hex")
					).toString(),
					"hex"
				)
			);
			this.signatures.push(signature);
		}

		/**
		 * 4 - Outsource the encrypted blocks.
		 */
		try {
			await this.connectToCSP();
			this.socket.emit("OUTSOURCING", {
				fileId: this.fileId,
				signatures: this.signatures,
				encryptedBlocks: this.encryptedBlocks,
			});
		} catch (err) {}

		/**
		 * 5 - Generate tags for the encrypted blocks.
		 */
		this.random = uuidv4();
		for (const encryptedBlock of this.encryptedBlocks) {
			let tag = await eccrypto.sign(
				this.privateKey,
				Buffer.from(
					SHA256(
						this.ID +
							this.publicKey.toString("hex") +
							this.fileId +
							encryptedBlock.ciphertext.toString("hex") +
							this.random
					).toString(),
					"hex"
				)
			);
			this.tags.push(tag.toString("hex"));
		}

		/**
		 * 6 - Store the tags on the blockchain.
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
				new Transaction(
					Date.now(),
					JSON.stringify(tag),
					Date.now()
				).toString()
			);
			this.blockchain.addBlock(
				new Block(this.blockchain.chain.length, Date.now(), transactions)
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
		resetTime();
		/**
		 * 1 - Restore encrypted blocks.
		 */
		await this.connectToCSP();
		this.socket.emit(
			"CHALLENGE",
			{
				fileId: this.fileId,
			},
			async () => {
				start = Date.now();
				const encryptedBlocks = readData("../files/data.txt");
				let resultedTags = [];
				for (const encryptedBlock of encryptedBlocks.map((encryptedBlock) =>
					JSON.parse(encryptedBlock)
				)) {
					let tag = await eccrypto.sign(
						this.privateKey,
						Buffer.from(
							SHA256(
								this.ID +
									this.publicKey.toString("hex") +
									this.fileId +
									encryptedBlock.ciphertext.toString("hex") +
									this.random
							).toString(),
							"hex"
						)
					);
					resultedTags.push(tag.toString("hex"));
				}
				const {
					data: { chain },
				} = await readBlockchain(blockchain, this.fileId);
				chain.shift();
				const storedTags = chain
					.flat()
					.map((transaction) => JSON.parse(transaction.split("#")[1]));
				console.log(
					`Is data intact: ${storedTags.every((tag) =>
						resultedTags.includes(tag)
					)}`
				);
				calculateTime("Phase 2: ", Date.now() - start, true);
			}
		);
	}
}
/**
 * Execution starts from here
 */
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
