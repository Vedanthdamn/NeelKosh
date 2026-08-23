import { BuyFlowClient } from "./BuyFlowClient";

export default async function ListingPage(props: PageProps<"/marketplace/[listingId]">) {
  const { listingId } = await props.params;
  return <BuyFlowClient listingId={listingId} />;
}
