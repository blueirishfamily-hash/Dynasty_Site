import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Database,
  Table as TableIcon,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
} from "lucide-react";

const COMMISSIONER_USER_IDS = ["900186363130503168"];

interface TableInfo {
  name: string;
  rowCount: number;
}

interface ColumnSchema {
  column: string;
  type: string;
  nullable: boolean;
  default: string | null;
}

interface TableDataResponse {
  data: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function DatabaseViewer() {
  const { user, league } = useSleeper();
  
  // Get initial table and leagueId from URL params
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const initialTable = urlParams.get("table");
  const initialLeagueId = urlParams.get("leagueId") || league?.leagueId || "";
  
  const [selectedTable, setSelectedTable] = useState<string | null>(initialTable);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(100);
  const [leagueIdFilter, setLeagueIdFilter] = useState(initialLeagueId);
  
  // Update selected table when URL param changes
  useEffect(() => {
    if (initialTable && selectedTable !== initialTable) {
      setSelectedTable(initialTable);
    }
  }, [initialTable]);

  const isCommissioner = !!(
    user?.userId &&
    (COMMISSIONER_USER_IDS.includes(user.userId) ||
      (league && league.commissionerId && user.userId === league.commissionerId))
  );

  // Fetch table list
  const { data: tables, isLoading: tablesLoading } = useQuery<TableInfo[]>({
    queryKey: ["/api/admin/database/tables"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/database/tables?userId=${user?.userId}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("Unauthorized: Commissioner access required");
        }
        throw new Error("Failed to fetch tables");
      }
      return res.json();
    },
    enabled: !!user?.userId && isCommissioner,
  });

  // Fetch table schema
  const { data: schema, isLoading: schemaLoading } = useQuery<ColumnSchema[]>({
    queryKey: ["/api/admin/database/tables", selectedTable, "schema"],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/database/tables/${selectedTable}/schema?userId=${user?.userId}`
      );
      if (!res.ok) throw new Error("Failed to fetch schema");
      return res.json();
    },
    enabled: !!selectedTable && !!user?.userId && isCommissioner,
  });

  // Fetch table data
  const { data: tableData, isLoading: dataLoading } = useQuery<TableDataResponse>({
    queryKey: [
      "/api/admin/database/tables",
      selectedTable,
      "data",
      page,
      limit,
      leagueIdFilter,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        userId: user?.userId || "",
        page: page.toString(),
        limit: limit.toString(),
      });
      if (leagueIdFilter) {
        params.append("leagueId", leagueIdFilter);
      }
      const res = await fetch(
        `/api/admin/database/tables/${selectedTable}?${params.toString()}`
      );
      if (!res.ok) throw new Error("Failed to fetch table data");
      return res.json();
    },
    enabled: !!selectedTable && !!user?.userId && isCommissioner,
  });

  const handleExportJSON = () => {
    if (!tableData?.data) return;
    const json = JSON.stringify(tableData.data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedTable}_${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    if (!tableData?.data || !schema) return;
    const headers = schema.map((col) => col.column).join(",");
    const rows = tableData.data.map((row) =>
      schema.map((col) => {
        const value = row[col.column];
        if (value === null || value === undefined) return "";
        if (typeof value === "string" && value.includes(",")) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return String(value);
      }).join(",")
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedTable}_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isCommissioner) {
    return (
      <div className="container mx-auto p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You must be a commissioner to access the database viewer.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Database className="w-8 h-8" />
          Database Viewer
        </h1>
        <p className="text-muted-foreground mt-2">
          View and inspect database tables (Commissioner Only)
        </p>
      </div>

      <Tabs defaultValue={initialTable ? "details" : "tables"} className="w-full">
        <TabsList>
          <TabsTrigger value="tables">Table List</TabsTrigger>
          {selectedTable && (
            <TabsTrigger value="details">
              {selectedTable} Details
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="tables" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Database Tables</CardTitle>
              <CardDescription>
                Select a table to view its schema and data
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tablesLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : tables && tables.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Table Name</TableHead>
                      <TableHead>Row Count</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tables.map((table) => (
                      <TableRow key={table.name}>
                        <TableCell className="font-mono">{table.name}</TableCell>
                        <TableCell>{table.rowCount.toLocaleString()}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedTable(table.name);
                              setPage(1);
                            }}
                          >
                            <TableIcon className="w-4 h-4 mr-2" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground">No tables found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {selectedTable && (
          <TabsContent value="details" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="font-mono">{selectedTable}</CardTitle>
                    <CardDescription>
                      {tableData?.pagination.total !== undefined &&
                        `${tableData.pagination.total.toLocaleString()} total rows`}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleExportJSON}>
                      <Download className="w-4 h-4 mr-2" />
                      Export JSON
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportCSV}>
                      <Download className="w-4 h-4 mr-2" />
                      Export CSV
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filters */}
                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <Label htmlFor="league-filter">Filter by League ID</Label>
                    <Input
                      id="league-filter"
                      placeholder="Enter league ID"
                      value={leagueIdFilter}
                      onChange={(e) => {
                        setLeagueIdFilter(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="limit">Rows per page</Label>
                    <Input
                      id="limit"
                      type="number"
                      min="10"
                      max="1000"
                      value={limit}
                      onChange={(e) => {
                        setLimit(parseInt(e.target.value) || 100);
                        setPage(1);
                      }}
                      className="w-24"
                    />
                  </div>
                </div>

                {/* Schema */}
                <div>
                  <h3 className="font-semibold mb-2">Schema</h3>
                  {schemaLoading ? (
                    <Skeleton className="h-32 w-full" />
                  ) : schema && schema.length > 0 ? (
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Column</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Nullable</TableHead>
                            <TableHead>Default</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {schema.map((col) => (
                            <TableRow key={col.column}>
                              <TableCell className="font-mono">{col.column}</TableCell>
                              <TableCell className="font-mono text-sm">{col.type}</TableCell>
                              <TableCell>{col.nullable ? "Yes" : "No"}</TableCell>
                              <TableCell className="font-mono text-sm">
                                {col.default || "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No schema information available</p>
                  )}
                </div>

                {/* Data */}
                <div>
                  <h3 className="font-semibold mb-2">Data</h3>
                  {dataLoading ? (
                    <Skeleton className="h-64 w-full" />
                  ) : tableData?.data && tableData.data.length > 0 ? (
                    <>
                      <div className="border rounded-md overflow-auto max-h-[600px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {schema?.map((col) => (
                                <TableHead key={col.column} className="font-mono">
                                  {col.column}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tableData.data.map((row, idx) => (
                              <TableRow key={idx}>
                                {schema?.map((col) => (
                                  <TableCell key={col.column} className="font-mono text-xs">
                                    {row[col.column] !== null && row[col.column] !== undefined
                                      ? String(row[col.column])
                                      : "—"}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      {/* Pagination */}
                      <div className="flex items-center justify-between mt-4">
                        <div className="text-sm text-muted-foreground">
                          Showing {((page - 1) * limit) + 1} to{" "}
                          {Math.min(page * limit, tableData.pagination.total)} of{" "}
                          {tableData.pagination.total.toLocaleString()} rows
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1}
                          >
                            <ChevronLeft className="w-4 h-4" />
                            Previous
                          </Button>
                          <span className="flex items-center px-4 text-sm">
                            Page {page} of {tableData.pagination.totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setPage((p) => Math.min(tableData.pagination.totalPages, p + 1))
                            }
                            disabled={page >= tableData.pagination.totalPages}
                          >
                            Next
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground">No data available</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

