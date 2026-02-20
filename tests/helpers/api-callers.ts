export async function callShipOut(body: Record<string, unknown>) {
  const { POST } = await import("../../app/api/logistics/ship-out/route");
  return POST(
    new Request("http://localhost/api/logistics/ship-out", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

export async function callUnitsMove(body: Record<string, unknown>) {
  const { POST } = await import("../../app/api/units/move/route");
  return POST(
    new Request("http://localhost/api/units/move", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

export async function callPickingTaskCancel(taskId = "t1") {
  const { POST } = await import("../../app/api/picking-tasks/[id]/cancel/route");
  return POST(
    new Request(`http://localhost/api/picking-tasks/${taskId}/cancel`, { method: "POST" }),
    { params: Promise.resolve({ id: taskId }) },
  );
}
