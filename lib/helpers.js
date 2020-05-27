const { writeFile, readFile } = require('fs').promises;

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
        if (err) {
            console.log(err)
            return false
        };
    })
    return true
}

const mapParamsToQuery = params => {
    // return empty string if params are empty
    if (typeof params === 'undefined' || Object.keys(params).length === 0) {
        return "";
    }

    return Object.keys(params).map(key => `${key}=${params[key]}`).join('&');
}

module.exports = {
    saveExchangeData,
    readExchangeData,
    mapParamsToQuery,
}