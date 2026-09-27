import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, Users, FileText } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatDate } from "@/lib/utils";

export default function Admin() {
  const { data: users, isLoading, error } = trpc.admin.userStats.useQuery();

  if (error) {
    return (
      <div className="sutaeru-editorial-page space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
          <p className="text-muted-foreground text-sm mt-1">User management and system overview</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-destructive">
            <Shield className="h-12 w-12 opacity-60" />
            <p className="text-base font-medium">Access Denied</p>
            <p className="text-sm text-muted-foreground">{error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="sutaeru-editorial-page space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-muted-foreground text-sm mt-1">User management and system overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center">
                <Users className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Users</p>
                <p className="text-2xl font-bold">{users?.length ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center">
                <FileText className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Files</p>
                <p className="text-2xl font-bold">{users?.reduce((acc, u) => acc + (u.filesGenerated || 0), 0) ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center">
                <Shield className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Admins</p>
                <p className="text-2xl font-bold">{users?.filter(u => u.role === "admin").length ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" /> All Users
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !users || users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Users className="h-12 w-12 opacity-30" />
              <p className="text-sm">No users found</p>
            </div>
          ) : (
             <div className="sutaeru-data-list">
               <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Role</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Files Generated</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Joined Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((user) => (
                     <tr key={user.id} className="hover:bg-muted/20">
                       <td data-label="Name" className="px-5 py-3 font-medium">{user.name ?? "-"}</td>
                       <td data-label="Email" className="px-5 py-3 text-muted-foreground break-all">{user.email ?? "-"}</td>
                       <td data-label="Role" className="px-5 py-3">
                        {user.role === "admin" ? (
                          <Badge className="bg-secondary text-foreground border-border gap-1">
                            <Shield className="h-3 w-3" /> Admin
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">User</Badge>
                        )}
                      </td>
                       <td data-label="Files Generated" className="px-5 py-3 text-right font-semibold">{user.filesGenerated ?? 0}</td>
                       <td data-label="Joined Date" className="px-5 py-3 text-right text-muted-foreground">{formatDate(user.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
