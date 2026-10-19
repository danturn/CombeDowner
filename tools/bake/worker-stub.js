// the baker never loads squares, so the real worker is never needed
export default class { postMessage() {} terminate() {} set onmessage(v) {} set onerror(v) {} }
