import OrderForm from "./OrderForm";

export const dynamic = "force-dynamic";

export default function NewOrderPage() {
  return (
    <main className="container">
      <h1>New Order</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        Register an order with full customization details.
      </p>
      <OrderForm />
    </main>
  );
}
