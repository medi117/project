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
	readData,
	writeData,
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
		this.encryptedTags = [];
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
		 * 2 - Generate tags for these data blocks.
		 */
		for (let block of this.dataBlocks) {
			let tag = SHA256(block).toString();
			this.tags.push(tag);
		}

		/**
		 * 3 - Sign the data blocks.
		 */
		for (const block of this.dataBlocks) {
			let signature = await eccrypto.sign(
				this.privateKey,
				Buffer.from(SHA256(block).toString(), "hex")
			);
			this.signatures.push(signature);
		}

		/**
		 * 3.5 - Generate ID for data file and save it locally.
		 */
		this.fileId = uuidv4();
		this.files.push({ fileId: this.fileId });

		/**
		 * 4 - Outsource fileId + data blocks + signatures.
		 */
		await this.connectToCSP();
		try {
			this.socket.emit("OUTSOURCING", {
				fileId: this.fileId,
				data: this.dataBlocks,
				signatures: this.signatures,
			});
		} catch (err) {}

		/**
		 * 5 - Encrypt the generated tags.
		 */
		for (const tag of this.tags) {
			let encryptedTag = await eccrypto.encrypt(
				this.publicKey,
				Buffer.from(tag, "hex")
			);
			this.encryptedTags.push({
				iv: encryptedTag.iv.toString("hex"),
				ciphertext: encryptedTag.ciphertext.toString("hex"),
				mac: encryptedTag.mac.toString("hex"),
				ephemPublicKey: encryptedTag.ephemPublicKey.toString("hex"),
			});
		}

		/**
		 * 6 - Store encrypted tags on the blockchain.
		 */
		let blockTags = [];
		for (let index = 0; index < this.encryptedTags.length; index += 10) {
			blockTags.push(
				this.encryptedTags.slice(
					index,
					index + 10 <= this.encryptedTags.length
						? index + 10
						: this.encryptedTags.length
				)
			);
		}

		blockTags.forEach((tags) => {
			let transactions = tags.map((encryptedTag) =>
				new Transaction(
					uuidv4(),
					JSON.stringify(encryptedTag),
					Date.now()
				).toString()
			);
			this.blockchain.addBlock(
				new Block(this.blockchain.chain.length, Date.now(), transactions)
			);
		});
		await saveBlockchain(blockchain, this.fileId, this.blockchain);
		calculateTime("Phase 1: ", Date.now() - start, true);
		writeData(this.dataBlocks, "../files/data.txt");
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
		 * 1 - Retrieve Tags of all data blocks from
		 *     the Cloud Storage Provider.
		 */
		await this.connectToCSP();
		this.socket.emit(
			"CHALLENGE",
			{
				fileId: this.fileId,
			},
			async ({ tags }) => {
				/**
				 * 2 - Restore encrypted tag from the blockchain
				 *     and decrypt them.
				 */
				start = Date.now();
				const { data: storedBlockchain } = await readBlockchain(
					blockchain,
					this.fileId
				);
				storedBlockchain.chain.shift();
				const encryptedTags = storedBlockchain.chain.map((block) =>
					block.map((transaction) => JSON.parse(transaction.split("#")[1]))
				);
				const decryptedTags = await Promise.all(
					encryptedTags.flat().map((encryptedTag) =>
						eccrypto.decrypt(this.privateKey, {
							iv: Buffer.from(encryptedTag.iv, "hex"),
							ciphertext: Buffer.from(encryptedTag.ciphertext, "hex"),
							mac: Buffer.from(encryptedTag.mac, "hex"),
							ephemPublicKey: Buffer.from(
								encryptedTag.ephemPublicKey,
								"hex"
							),
						})
					)
				);
				/**
				 * 1 - Compare retrieved tags with decrypted tags.
				 */
				console.log(
					`Is data intact: ${tags.every((tag) =>
						decryptedTags
							.map((decryptedTag) => decryptedTag.toString("hex"))
							.includes(tag)
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
