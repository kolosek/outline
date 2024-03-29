// @flow
import crypto from "crypto";
import fetch from "isomorphic-fetch";

export async function generateAvatarUrl({
  id,
  domain,
  name = "Unknown",
}: {
  id: string,
  domain?: string,
  name?: string,
}) {
  // attempt to get logo from Clearbit API. If one doesn't exist then
  // fall back to using tiley to generate a placeholder logo
  const hash = crypto.createHash("sha256");
  hash.update(id);
  const hashedId = hash.digest("hex");

  let cbResponse, cbUrl;
  if (domain) {
    cbUrl = `https://logo.clearbit.com/${domain}`;
    try {
      cbResponse = await fetch(cbUrl);
    } catch (err) {
      // okay
    }
  }

  const tileyUrl = `https://tiley.herokuapp.com/avatar/${hashedId}/${name[0]}.png`;
  return cbUrl && cbResponse && cbResponse.status === 200 ? cbUrl : tileyUrl;
}
