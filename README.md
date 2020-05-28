# executionReport delay monitor

This app monitors latency of incoming executionReport data frames on matched trades from binance stream.

## Installation
1. Clone the repo
- `git clone https://github.com/dlneti/executionReportDelay.git`
2. cd into app directory 
- `cd executionReportDelay`
3. Generate RSA public private key pair
```bash
mkdir keys; cd keys # create keys directory and cd into it

# generate private key:
openssl genrsa -out app-prv-key.pem 4096
# generate public key:
openssl rsa -in app-prv-key.pem -pubout -outform PEM -out app-pub-key.pem

```
4. Copy your public key from `app-pub-key.pem` and register it [here](https://testnet.binance.vision)
5. During the registration process you will also get an API key. Create a new file in app root directory called `.env` and paste this key there.
The file should look like this:
```bash
API_KEY=exampleKey           # paste you api key here instead of 'exampleKey'
```
6. cd into root directory and run `npm install`
7. Now everything is setup to send authenticated requests from your account to binance testnet api


## Usage
Run `npm start` to start to app.

To start a delay check simply select `Start delay check` from main menu. 
- The app will prompt you for the delay you want to get alerts for, then some order details.
- After submitting, the app will submit a limit order with parameters that you entered, then it will submit a market order to fill that limit order. This way we always get filled trades and we have more trades to monitor delay for. 
- At the end of this process a delays summary will be displayed.

You can also see your balances, open orders and cancel any open orders.

## Notes
I didn't implement everything I wanted as I only had limited time work on this project.
Here are things that can be added in the future to improve functionality and UX:
- Proper delay monitoring, saving the alerts and trades to database instead of just logging to console.
- Comprehensive delay reporting with trade metadata from saved alerts.
- Integration tests. So far I only added a few simple unit tests.
- Give more control to the user to configure custom trades and delay monitoring logic.
- Improve logic with observables


## License
[MIT](https://choosealicense.com/licenses/mit/)