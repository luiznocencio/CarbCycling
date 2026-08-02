import PreferencesEditor from "@/components/PreferencesEditor";

export default function PreferencesPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-3">
      <div>
        <h1 className="text-lg font-semibold">Preferências</h1>
        <p className="text-sm text-muted">
          O que você gosta, evita e não pode comer. Preencha na mão ou use o chat
          de IA para ajudar — o formulário é a fonte da verdade e só é salvo quando
          você clicar em salvar.
        </p>
      </div>
      <PreferencesEditor />
    </main>
  );
}
