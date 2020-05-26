const { writeFile, readFile } = require('fs/promises');

const STORAGE_PATH = `${__dirname}/storage/data.json`;

const saveExchangeData = async exchange => {
    await _saveToJSON(exchange);
}

const readExchangeData = async () => {
    const data = await readFile(STORAGE_PATH)

    return JSON.parse(data);
}

const _saveToJSON = async json => {
    await writeFile(STORAGE_PATH, JSON.stringify(json, null, 4), err => {
        if (err) throw err;
        // console.log('The file has been saved!');
    })
}



module.exports = {
    saveExchangeData: saveExchangeData,
    readExchangeData: readExchangeData,
}