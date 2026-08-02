import FoodBank from "@/components/FoodBank";

export default function FoodsPage() {
  return (
    <main className="mx-auto max-w-3xl">
      <h1 className="mb-3 text-lg font-semibold text-foreground">
        Banco de alimentos
      </h1>
      <FoodBank />
    </main>
  );
}
