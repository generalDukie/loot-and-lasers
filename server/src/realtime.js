const subscribers = new Set();

export function addSubscriber(ws, { entityType = "*", token = null } = {}) {
  const sub = { ws, entityType, token };
  subscribers.add(sub);
  ws.on("close", () => subscribers.delete(sub));
  return sub;
}

export function broadcastEntity(entityType, eventType, data) {
  const payload = JSON.stringify({
    entity: entityType,
    type: eventType,
    data,
  });
  for (const sub of subscribers) {
    if (sub.entityType !== "*" && sub.entityType !== entityType) continue;
    if (sub.ws.readyState === 1) {
      try {
        sub.ws.send(payload);
      } catch {
        subscribers.delete(sub);
      }
    }
  }
}
