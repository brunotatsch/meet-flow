import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@web/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@web/components/card";

export function PublicLinkCard({ companySlug }: { companySlug: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/${companySlug}/agendar`;

  async function handleCopy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Link público de agendamento</CardTitle>
        <CardDescription>Compartilhe com os seus clientes.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 text-sm">{link}</code>
        <Button variant="outline" size="icon" onClick={handleCopy} aria-label="Copiar link">
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </CardContent>
    </Card>
  );
}
