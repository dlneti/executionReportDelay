const { writeFile, readFile } = require('fs').promises;

const STORAGE_PATH = `${__dirname}/exchangeData.json`;

const saveExchangeData =  async exchange => {
    return await _saveToJSON(exchange);
}

/**
 * reads data saved in STORAGE_PATH
 */
const readExchangeData = async () => {
    const data = await readFileSync(STORAGE_PATH)
    
    return JSON.parse(data);
}

/**
 * saves file to STORAGE_PATH
 * @param {*} json JSON object to be saved to file
 */
const _saveToJSON = async json => {
    await writeFile(STORAGE_PATH, JSON.stringify(json, null, 4), err => {
        if (err) {
            console.log(err)
            return false
        };
    })

    return true
}

/**
 * parses Objects keys and values and returns url query string 
 * @param {Object} params Flat object of keys and values
 */
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