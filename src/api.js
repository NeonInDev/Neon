const axios = require("axios");

async function cotacaoMoeda() {
  const { data } = await axios.get("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,GBP-BRL,ARS-BRL", { timeout: 10000 });
  return {
    dolar: { compra: parseFloat(data.USDBRL.bid), variacao: parseFloat(data.USDBRL.pctChange) },
    euro: { compra: parseFloat(data.EURBRL.bid), variacao: parseFloat(data.EURBRL.pctChange) },
    libra: { compra: parseFloat(data.GBPBRL.bid), variacao: parseFloat(data.GBPBRL.pctChange) },
    peso: { compra: parseFloat(data.ARSBRL.bid), variacao: parseFloat(data.ARSBRL.pctChange) },
    data: data.USDBRL.create_date,
  };
}

async function cotacaoCrypto() {
  const { data } = await axios.get("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,cardano,ripple&vs_currencies=usd&include_24hr_change=true", { timeout: 10000 });
  return {
    bitcoin: { usd: data.bitcoin.usd, variacao24h: data.bitcoin.usd_24h_change },
    ethereum: { usd: data.ethereum.usd, variacao24h: data.ethereum.usd_24h_change },
    solana: { usd: data.solana.usd, variacao24h: data.solana.usd_24h_change },
  };
}

module.exports = { cotacaoMoeda, cotacaoCrypto };