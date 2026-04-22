const { EventEmitter } = require("events");

const bus = new EventEmitter();

function publishSalesEvent(type, payload = {}) {
  bus.emit("sales:event", {
    type,
    payload,
    at: new Date().toISOString(),
  });
}

function subscribeSalesEvents(listener) {
  bus.on("sales:event", listener);
  return () => {
    bus.off("sales:event", listener);
  };
}

module.exports = {
  publishSalesEvent,
  subscribeSalesEvents,
};
