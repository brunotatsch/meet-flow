export function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-semibold">meet-flow</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Acesse o link de agendamento da sua empresa, ou entre em{" "}
        <a href="/admin/login" className="text-primary underline-offset-4 hover:underline">
          /admin
        </a>{" "}
        se você administra um hotel ou coworking.
      </p>
    </div>
  );
}
