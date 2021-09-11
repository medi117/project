const fs = require("fs");
const lineByLine = require("n-readlines");
let timeArr = [];
const writeData = (dataBlocks, path) => {
	fs.writeFileSync(path, "");
	dataBlocks.forEach((dataBlock) => {
		fs.appendFileSync(path, dataBlock + "\n");
	});
};

const readData = (path) => {
	let lines = [];
	const liner = new lineByLine(path);

	let line;
	while ((line = liner.next())) {
		lines.push(line.toString());
	}
	return lines;
};

const saveBlockchain = (blockchain, key, data) => {
	return new Promise((resolve, reject) => {
		blockchain.put(
			key,
			{
				data: data,
			},
			(err) => {
				if (err) {
					return reject(err);
				}
				resolve();
			}
		);
	});
};

const readBlockchain = (blockchain, key) => {
	return new Promise((resolve, reject) => {
		blockchain.get(key, async (err, data) => {
			if (err) {
				return reject(err);
			}
			resolve(data);
		});
	});
};

const calculateTime = (phase, ms, done) => {
	if (!done || !timeArr.length) {
		timeArr.push(ms);
	}
	const sum = timeArr.reduce((acc, current) => {
		return acc + current;
	}, 0);
	if (done) {
		console.log(
			phase +
				new Date(sum).getMinutes() +
				"m :" +
				new Date(sum).getSeconds() +
				"s :" +
				new Date(sum).getMilliseconds() +
				"ms"
		);
	}
};
const resetTime = () => {
	timeArr = [];
};
module.exports = {
	resetTime,
	writeData,
	readData,
	calculateTime,
	saveBlockchain,
	readBlockchain,
};
