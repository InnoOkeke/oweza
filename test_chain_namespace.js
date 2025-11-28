const { ChainNamespace } = require("@web3auth/base");
console.log("ChainNamespace:", ChainNamespace);
if (ChainNamespace && ChainNamespace.EIP155) {
    console.log("ChainNamespace.EIP155:", ChainNamespace.EIP155);
} else {
    console.log("ChainNamespace.EIP155 is undefined");
}
