import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { ShieldCheck, Clock3, History, CheckCircle2, XCircle, UserPlus, UserX, Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { orderBy, setDocIn, useCollection, type ActivityLog, type ChangeRequest, type Member } from "@/lib/data";
import { applyApprovedRequest, rejectRequest } from "@/lib/workflow";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AppUser, Role, UserStatus } from "@/lib/firebase";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authed/admin")({
  component: AdminPage,
});

type ManagedUser = AppUser & {
  id: string;
};

function statusLabel(status?: UserStatus, active?: boolean) {
  if (status === "removed") return "Removed";
  if (status === "suspended" || active === false) return "Suspended";
  return "Active";
}

function AdminPage() {
  const { profile, adminCreateUser } = useAuth();
  const { data: requests } = useCollection<ChangeRequest>("change_requests", [orderBy("createdAt", "desc")]);
  const { data: logs } = useCollection<ActivityLog>("activity_logs", [orderBy("createdAt", "desc")]);
  const { data: users, loading: usersLoading } = useCollection<ManagedUser>("users", [orderBy("createdAt", "desc")]);
  const { data: members } = useCollection<Member>("members", [orderBy("joinedAt", "desc")]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [creating, setCreating] = useState(false);
  const [actingUid, setActingUid] = useState<string | null>(null);

  const memberMap = useMemo(
    () => new Map(members.map((member) => [member.uid || member.id, member])),
    [members]
  );

  if (profile?.role !== "owner") {
    return (
      <div>
        <PageHeader title="Admin" description="Owner access only" />
        <div className="p-6">
          <Card className="p-6 text-sm text-muted-foreground">
            Only the Owner can access the admin approval and tracking page.
          </Card>
        </div>
      </div>
    );
  }

  const actor = {
    uid: profile.uid,
    name: profile.name,
    role: profile.role,
  } as const;

  const pending = requests.filter((request) => request.status === "pending");

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await adminCreateUser({ email: email.trim(), password, name: name.trim(), role });
      toast.success("User account created successfully.");
      setName("");
      setEmail("");
      setPassword("");
      setRole("member");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleUserStatus = async (userItem: ManagedUser, nextStatus: UserStatus) => {
    if (userItem.uid === profile.uid && nextStatus !== "active") {
      toast.error("You cannot suspend or remove your own owner account.");
      return;
    }

    setActingUid(userItem.uid);
    try {
      const nextActive = nextStatus === "active";
      const timestamp = Date.now();
      await setDocIn("users", userItem.uid, {
        status: nextStatus,
        active: nextActive,
        suspendedAt: nextStatus === "suspended" ? timestamp : null,
        removedAt: nextStatus === "removed" ? timestamp : null,
        updatedAt: timestamp,
      });

      const relatedMember = memberMap.get(userItem.uid);
      if (relatedMember) {
        await setDocIn("members", relatedMember.id, {
          active: nextActive,
          role: userItem.role,
          uid: userItem.uid,
          name: userItem.name,
          email: userItem.email,
        });
      }

      toast.success(
        nextStatus === "active"
          ? "User reactivated."
          : nextStatus === "suspended"
            ? "User suspended."
            : "User removed from MessHub."
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setActingUid(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Admin"
        description="Create users, control access, approve requests, and review tracking logs"
      />
      <div className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <div>
                <div className="text-sm text-muted-foreground">Admin role</div>
                <div className="font-semibold">Owner approval control</div>
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <Clock3 className="h-5 w-5 text-primary" />
              <div>
                <div className="text-sm text-muted-foreground">Pending approvals</div>
                <div className="font-semibold">{pending.length}</div>
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <History className="h-5 w-5 text-primary" />
              <div>
                <div className="text-sm text-muted-foreground">Tracked actions</div>
                <div className="font-semibold">{logs.length}</div>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[420px,minmax(0,1fr)]">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Add user</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a new MessHub account with email and password directly from the dashboard.
            </p>
            <form onSubmit={handleCreateUser} className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-user-name">Full name</Label>
                <Input id="admin-user-name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-user-email">Email</Label>
                <Input id="admin-user-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-user-password">Password</Label>
                <Input
                  id="admin-user-password"
                  type="password"
                  minLength={6}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>User role</Label>
                <Select value={role} onValueChange={(value) => setRole(value as Role)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={creating}>
                <UserPlus className="mr-2 h-4 w-4" />
                {creating ? "Creating..." : "Create user"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Suspend and remove below are app-level access controls. They block MessHub access immediately, even though browser-only Firebase cannot fully disable Auth accounts.
              </p>
            </form>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold">User management</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Suspend, reactivate, or remove any non-owner access from the dashboard.
            </p>
            <div className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-sm text-muted-foreground">
                        Loading users...
                      </TableCell>
                    </TableRow>
                  ) : users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-sm text-muted-foreground">
                        No users found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((userItem) => {
                      const currentStatus = (userItem.status || (userItem.active === false ? "suspended" : "active")) as UserStatus;
                      const busy = actingUid === userItem.uid;

                      return (
                        <TableRow key={userItem.uid}>
                          <TableCell>
                            <div className="font-medium">{userItem.name}</div>
                            <div className="text-xs text-muted-foreground">{userItem.email}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {userItem.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                currentStatus === "active"
                                  ? "default"
                                  : currentStatus === "suspended"
                                    ? "secondary"
                                    : "destructive"
                              }
                            >
                              {statusLabel(currentStatus, userItem.active)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              {currentStatus !== "suspended" && currentStatus !== "removed" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => handleUserStatus(userItem, "suspended")}
                                >
                                  <Ban className="mr-1 h-4 w-4" />
                                  Suspend
                                </Button>
                              )}
                              {currentStatus !== "active" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => handleUserStatus(userItem, "active")}
                                >
                                  <RotateCcw className="mr-1 h-4 w-4" />
                                  Reactivate
                                </Button>
                              )}
                              {currentStatus !== "removed" && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={busy}
                                  onClick={() => handleUserStatus(userItem, "removed")}
                                >
                                  <UserX className="mr-1 h-4 w-4" />
                                  Remove
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>

        <Card className="p-5">
          <h3 className="font-semibold">Approval inbox</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Members and managers can submit add, edit, and delete requests. Owner approves or rejects them here.
          </p>
          <div className="mt-4 space-y-3">
            {pending.length === 0 ? (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">No pending requests right now.</div>
            ) : (
              pending.map((request) => (
                <div key={request.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{request.collectionName}</Badge>
                    <Badge variant="secondary">{request.action}</Badge>
                    <Badge variant="outline">{request.requestedByRole}</Badge>
                  </div>
                  <div className="mt-3 font-medium">{request.title}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Requested by {request.requestedByName}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          await applyApprovedRequest(request, actor);
                          toast.success("Request approved");
                        } catch (error) {
                          toast.error((error as Error).message);
                        }
                      }}
                    >
                      <CheckCircle2 className="mr-1 h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await rejectRequest(request, actor);
                          toast.success("Request rejected");
                        } catch (error) {
                          toast.error((error as Error).message);
                        }
                      }}
                    >
                      <XCircle className="mr-1 h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold">Activity tracking</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Every request submission and approval decision is stored in `activity_logs`.
          </p>
          <div className="mt-4 space-y-2">
            {logs.length === 0 ? (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">No tracked actions yet.</div>
            ) : (
              logs.slice(0, 20).map((log) => (
                <div key={log.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{log.entity}</Badge>
                    <Badge variant="secondary">{log.action}</Badge>
                    <Badge>{log.actorRole}</Badge>
                  </div>
                  <div className="mt-2 text-sm">{log.message}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{log.actorName}</div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
