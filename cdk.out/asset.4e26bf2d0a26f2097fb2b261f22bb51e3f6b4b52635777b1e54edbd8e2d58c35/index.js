'use strict';
var h = Object.create,
  d = Object.defineProperty,
  w = Object.getOwnPropertyDescriptor,
  f = Object.getOwnPropertyNames,
  C = Object.getPrototypeOf,
  P = Object.prototype.hasOwnProperty,
  b = (e, o) => {
    for (var n in o) d(e, n, { get: o[n], enumerable: !0 });
  },
  p = (e, o, n, t) => {
    if ((o && typeof o == 'object') || typeof o == 'function')
      for (let r of f(o))
        !P.call(e, r) &&
          r !== n &&
          d(e, r, {
            get: () => o[r],
            enumerable: !(t = w(o, r)) || t.enumerable,
          });
    return e;
  },
  S = (e, o, n) => (
    (n = e != null ? h(C(e)) : {}),
    p(
      o || !e || !e.__esModule
        ? d(n, 'default', { value: e, enumerable: !0 })
        : n,
      e
    )
  ),
  G = (e) => p(d({}, '__esModule', { value: !0 }), e),
  q = {};
b(q, { handler: () => E }), (module.exports = G(q));
var i = S(require('@aws-sdk/client-cloudwatch-logs'));
async function R(e, o, n) {
  await n(async () => {
    try {
      let t = { logGroupName: e },
        r = new i.CreateLogGroupCommand(t);
      await o.send(r);
    } catch (t) {
      if (t.name === 'ResourceAlreadyExistsException') return;
      throw t;
    }
  });
}
async function x(e, o, n) {
  await n(async () => {
    try {
      let t = { logGroupName: e },
        r = new i.DeleteLogGroupCommand(t);
      await o.send(r);
    } catch (t) {
      if (t.name === 'ResourceNotFoundException') return;
      throw t;
    }
  });
}
async function y(e, o, n, t) {
  await n(async () => {
    if (t) {
      let r = { logGroupName: e, retentionInDays: t },
        s = new i.PutRetentionPolicyCommand(r);
      await o.send(s);
    } else {
      let r = { logGroupName: e },
        s = new i.DeleteRetentionPolicyCommand(r);
      await o.send(s);
    }
  });
}
async function E(e, o) {
  try {
    console.log(JSON.stringify({ ...e, ResponseURL: '...' }));
    let t = e.ResourceProperties.LogGroupName,
      r = e.ResourceProperties.LogGroupRegion,
      s = L(e.ResourceProperties.SdkRetry?.maxRetries) ?? 5,
      a = I(s),
      m = { logger: console, region: r, maxAttempts: Math.max(5, s) },
      c = new i.CloudWatchLogsClient(m);
    if (
      (e.RequestType === 'Create' || e.RequestType === 'Update') &&
      (await R(t, c, a),
      await y(t, c, a, L(e.ResourceProperties.RetentionInDays)),
      e.RequestType === 'Create')
    ) {
      let g = new i.CloudWatchLogsClient({
        logger: console,
        region: process.env.AWS_REGION,
      });
      await R(`/aws/lambda/${o.functionName}`, g, a),
        await y(`/aws/lambda/${o.functionName}`, g, a, 1);
    }
    e.RequestType === 'Delete' &&
      e.ResourceProperties.RemovalPolicy === 'destroy' &&
      (await x(t, c, a)),
      await n('SUCCESS', 'OK', t);
  } catch (t) {
    console.log(t),
      await n('FAILED', t.message, e.ResourceProperties.LogGroupName);
  }
  function n(t, r, s) {
    let a = JSON.stringify({
      Status: t,
      Reason: r,
      PhysicalResourceId: s,
      StackId: e.StackId,
      RequestId: e.RequestId,
      LogicalResourceId: e.LogicalResourceId,
      Data: { LogGroupName: e.ResourceProperties.LogGroupName },
    });
    console.log('Responding', a);
    let m = require('url').parse(e.ResponseURL),
      c = {
        hostname: m.hostname,
        path: m.path,
        method: 'PUT',
        headers: {
          'content-type': '',
          'content-length': Buffer.byteLength(a, 'utf8'),
        },
      };
    return new Promise((g, l) => {
      try {
        let u = require('https').request(c, g);
        u.on('error', l), u.write(a), u.end();
      } catch (u) {
        l(u);
      }
    });
  }
}
function L(e, o = 10) {
  if (e !== void 0) return parseInt(e, o);
}
function I(e, o = 100, n = 10 * 1e3) {
  return async (t) => {
    let r = 0;
    do
      try {
        return await t();
      } catch (s) {
        if (
          s.name === 'OperationAbortedException' ||
          s.name === 'ThrottlingException'
        )
          if (r < e) {
            r++, await new Promise((a) => setTimeout(a, k(r, o, n)));
            continue;
          } else throw new Error('Out of attempts to change log group');
        throw s;
      }
    while (!0);
  };
}
function k(e, o, n) {
  return Math.round(Math.random() * Math.min(n, o * 2 ** e));
}
