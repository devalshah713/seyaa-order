import JewelleryInForm from "./JewelleryInForm";

export const dynamic = "force-dynamic";

export default function NewJewelleryInPage({
  searchParams,
}: {
  searchParams: { design?: string };
}) {
  return (
    <main className="container">
      <h1>Jewellery In from Manufacturer</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        Receive a design back from the factory: record how many diamonds were used and how many came
        back (unused or broken). The difference updates the Diamond Issue sheet and returned diamonds
        are logged to the Diamond Return sheet. (Gold &amp; final jewellery details come in the next module.)
      </p>
      <JewelleryInForm initialDesign={searchParams.design || ""} />
    </main>
  );
}
