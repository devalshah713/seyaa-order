// Reading an answer back from our own API, in one place.
//
// A request that runs out of processor time is not answered by our code at
// all: the platform steps in and sends back an HTML error page. Calling
// res.json() on that throws "Unexpected token '<'", which tells the person at
// the desk nothing and has already been mistaken twice for the form being
// broken. So the body is read as text first and parsed deliberately, and a
// reply that is not ours is reported as what it is.
export async function readReply(
  res: Response,
  fallback: string
): Promise<Record<string, unknown>> {
  const text = await res.text().catch(() => "");

  let data: Record<string, unknown>;
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(
      `The server could not finish this (status ${res.status}). ` +
        "Wait a moment and try again, and tell Deval if it keeps happening."
    );
  }

  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" && data.error ? data.error : fallback
    );
  }
  return data;
}
