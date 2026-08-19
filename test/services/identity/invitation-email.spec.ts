import { describe, expect, it, vi } from "vitest";
import { createInvitationEmailEnqueuer } from "@services/identity/infra/auth/invitation-email";

describe("e-mail de convite", () => {
  it("aguarda o enqueue durável com dedupe e link de aceite escapado", async () => {
    const enqueueMessage = vi.fn().mockResolvedValue(true);
    const enqueue = createInvitationEmailEnqueuer(
      { enqueueMessage },
      "https://meetflow.example.com/",
    );

    await enqueue({
      id: "invite/id",
      email: "pessoa@example.com",
      role: "staff",
      organization: { name: "Hotel <Central>" },
      inviter: { user: { name: "Olivia & Cia" } },
      invitation: { id: "invite/id", expiresAt: new Date("2030-01-03T12:00:00.000Z") },
    });

    expect(enqueueMessage).toHaveBeenCalledOnce();
    expect(enqueueMessage).toHaveBeenCalledWith({
      dedupeKey: "team-invitation:invite/id",
      message: expect.objectContaining({
        to: ["pessoa@example.com"],
        subject: "Convite para Hotel <Central> — MeetFlow",
        text: expect.stringContaining("https://meetflow.example.com/admin/convite/invite%2Fid"),
        html: expect.stringContaining("Hotel &lt;Central&gt;"),
      }),
    });
  });
});
