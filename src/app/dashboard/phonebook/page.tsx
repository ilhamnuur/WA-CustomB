"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/components/dashboard/session-provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious
} from "@/components/ui/pagination";

import { Search, Loader2, UserPlus, Tag, Folder, Phone, Edit, Trash2, Upload, HelpCircle, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import * as XLSX from "xlsx";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface PhoneContact {
    id: string;
    number: string;
    name?: string;
    category?: string;
    tags?: string;
    createdAt: string;
}

export default function PhoneBookPage() {
    const { sessionId } = useSession();
    const [contacts, setContacts] = useState<PhoneContact[]>([]);
    const [loading, setLoading] = useState(false);

    // Filters
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState("10");
    const [meta, setMeta] = useState({ total: 0, totalPages: 1 });

    // Form state
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [importData, setImportData] = useState<any[]>([]);
    const [importFileName, setImportFileName] = useState("");
    const [formData, setFormData] = useState({
        name: "",
        number: "",
        category: "",
        tags: ""
    });

    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1); 
            fetchContacts();
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        fetchContacts();
    }, [page, sessionId, limit]);

    const fetchContacts = async () => {
        if (!sessionId) return;
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: limit,
                search: search
            });

            const res = await fetch(`/api/phonebook/${sessionId}?${params}`);
            const data = await res.json();

            if (res.ok) {
                setContacts(data.data);
                setMeta(data.meta);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveContact = async () => {
        if (!sessionId || !formData.number) return;
        
        setIsSaving(true);
        try {
            const res = await fetch(`/api/phonebook/${sessionId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                toast.success("Contact added to phonebook");
                setIsDialogOpen(false);
                setFormData({ name: "", number: "", category: "", tags: "" });
                fetchContacts();
            } else {
                const err = await res.json();
                toast.error(err.message || "Failed to save");
            }
        } catch (error) {
            toast.error("An error occurred");
        } finally {
            setIsSaving(false);
        }
    };

    const handleImport = async () => {
        if (!sessionId || importData.length === 0) return;
        
        setIsSaving(true);
        try {
            const parsed = importData.map(row => {
                // Try to find columns regardless of case
                const numberKey = Object.keys(row).find(k => 
                    ["number", "nomor", "phone", "telepon", "wa", "whatsapp"].includes(k.toLowerCase())
                ) || "Number";
                
                const nameKey = Object.keys(row).find(k => 
                    ["name", "nama", "fullname"].includes(k.toLowerCase())
                ) || "Name";

                const categoryKey = Object.keys(row).find(k => 
                    ["category", "kategori"].includes(k.toLowerCase())
                ) || "Category";

                const tagsKey = Object.keys(row).find(k => 
                    ["tags", "tag", "label", "group"].includes(k.toLowerCase())
                ) || "Tags";

                return {
                    name: String(row[nameKey] || ""),
                    number: String(row[numberKey] || ""),
                    category: String(row[categoryKey] || ""),
                    tags: String(row[tagsKey] || "")
                };
            }).filter(c => c.number);

            if (parsed.length === 0) {
                toast.error("No valid contacts with phone numbers found");
                setIsSaving(false);
                return;
            }

            const res = await fetch(`/api/phonebook/${sessionId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(parsed)
            });

            if (res.ok) {
                toast.success(`Imported ${parsed.length} contacts`);
                setIsImportOpen(false);
                setImportData([]);
                setImportFileName("");
                fetchContacts();
            } else {
                const err = await res.json();
                toast.error(err.message || "Import failed");
            }
        } catch (error) {
            console.error("Import error:", error);
            toast.error("Format error in Excel data");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDownloadTemplate = () => {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([
            ["Name", "Number", "Category", "Tags"],
            ["John Doe", "628123456789", "Customers", "VIP, Jakarta"],
            ["Jane Smith", "628987654321", "Vendors", "URGENT"]
        ]);
        XLSX.utils.book_append_sheet(wb, ws, "Phonebook Template");
        XLSX.writeFile(wb, "phonebook_template.xlsx");
        toast.success("Excel template downloaded.");
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Manual Phonebook</h2>
                    <p className="text-muted-foreground">
                        Manage your private contact lists and custom groups for broadcasting.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    <Button variant="secondary" onClick={handleDownloadTemplate}>
                        <HelpCircle className="mr-2 h-4 w-4" /> Download Template
                    </Button>
                    <Button variant="outline" onClick={() => setIsImportOpen(true)} disabled={!sessionId}>
                        <Upload className="mr-2 h-4 w-4" /> Import Excel
                    </Button>
                    <Button onClick={() => setIsDialogOpen(true)} disabled={!sessionId}>
                        <UserPlus className="mr-2 h-4 w-4" /> Add Contact
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="space-y-1">
                            <CardTitle>Phonebook Entries</CardTitle>
                            <CardDescription>
                                Total: {meta.total} manual contacts
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <Select value={limit} onValueChange={(val) => { setLimit(val); setPage(1); }}>
                                <SelectTrigger className="w-[120px]">
                                    <SelectValue placeholder="Per page" />
                                </SelectTrigger>
                                <SelectContent>
                                    {[10, 25, 50, 100].map((l) => (
                                        <SelectItem key={l} value={l.toString()}>
                                            {l} / entry
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <div className="relative w-full md:w-64">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by name, number, tags..."
                                    className="pl-8"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead>Contact Name</TableHead>
                                    <TableHead>Phone Number</TableHead>
                                    <TableHead className="hidden lg:table-cell">Category</TableHead>
                                    <TableHead className="hidden md:table-cell">Groups / Tags</TableHead>
                                    <TableHead className="text-right">Added</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-32 text-center">
                                            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                                        </TableCell>
                                    </TableRow>
                                ) : contacts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic">
                                            No manual contacts found. Start by adding one or importing a list.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    contacts.map((contact) => (
                                        <TableRow key={contact.id}>
                                            <TableCell className="font-medium">
                                                {contact.name || "Unnamed"}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                    <Phone className="h-3 w-3 text-muted-foreground" />
                                                    {contact.number}
                                                </div>
                                            </TableCell>
                                            <TableCell className="hidden lg:table-cell">
                                                {contact.category && (
                                                    <Badge variant="outline" className="bg-slate-50">
                                                        <Folder className="h-3 w-3 mr-1" /> {contact.category}
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell">
                                                <div className="flex flex-wrap gap-1">
                                                    {contact.tags?.split(',').map((tag, i) => (
                                                        <Badge key={i} variant="secondary" className="text-[10px] bg-blue-50 text-blue-700">
                                                            <Tag className="h-2 w-2 mr-1" /> {tag.trim()}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right text-xs text-muted-foreground">
                                                {new Date(contact.createdAt).toLocaleDateString()}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {meta.totalPages > 1 && (
                        <div className="mt-4 flex justify-center">
                            <Pagination>
                                <PaginationContent>
                                    <PaginationItem>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={page <= 1}
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                        >
                                            Previous
                                        </Button>
                                    </PaginationItem>
                                    <PaginationItem>
                                        <span className="text-xs px-4">Page {page} of {meta.totalPages}</span>
                                    </PaginationItem>
                                    <PaginationItem>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={page >= meta.totalPages}
                                            onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                                        >
                                            Next
                                        </Button>
                                    </PaginationItem>
                                </PaginationContent>
                            </Pagination>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Add Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Manual Contact</DialogTitle>
                        <DialogDescription>Enter a phone number to add it to your broadcast list.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>Phone Number (with country code)</Label>
                            <Input placeholder="628123456789" value={formData.number} onChange={e => setFormData({...formData, number: e.target.value})} />
                        </div>
                        <div className="grid gap-2">
                            <Label>Full Name (Optional)</Label>
                            <Input placeholder="John Doe" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                        </div>
                        <div className="grid gap-2">
                            <Label>Category</Label>
                            <Input placeholder="Customers" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} />
                        </div>
                        <div className="grid gap-2">
                            <Label>Tags (comma separated)</Label>
                            <Input placeholder="VIP, Jakarta" value={formData.tags} onChange={e => setFormData({...formData, tags: e.target.value})} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleSaveContact} disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Contact
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Import Dialog */}
            <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <Upload className="h-5 w-5 text-primary" /> Bulk Import Contacts
                        </DialogTitle>
                        <DialogDescription>
                            Upload an <strong>Excel (.xlsx, .xls)</strong> file containing your contacts. 
                            <br />Make sure to use the template for the best results.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-6 space-y-4">
                        <div className="border-2 border-dashed border-muted-foreground/20 rounded-xl p-8 text-center hover:bg-muted/50 transition-colors relative cursor-pointer group">
                            <input 
                                type="file" 
                                accept=".xlsx, .xls" 
                                className="absolute inset-0 opacity-0 cursor-pointer" 
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    
                                    const reader = new FileReader();
                                    reader.onload = (event) => {
                                        try {
                                            const data = new Uint8Array(event.target?.result as ArrayBuffer);
                                            const workbook = XLSX.read(data, { type: "array" });
                                            const firstSheetName = workbook.SheetNames[0];
                                            const worksheet = workbook.Sheets[firstSheetName];
                                            const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                                            
                                            if (jsonData.length === 0) {
                                                toast.error("Excel file is empty");
                                                return;
                                            }
                                            
                                            setImportData(jsonData);
                                            setImportFileName(file.name);
                                            toast.info(`Selected: ${file.name}`);
                                        } catch (error) {
                                            toast.error("Failed to parse Excel file");
                                        }
                                    };
                                    reader.readAsArrayBuffer(file);
                                }}
                            />
                            <div className="flex flex-col items-center gap-2">
                                <div className="p-3 bg-primary/10 rounded-full group-hover:scale-110 transition-transform">
                                    <FileSpreadsheet className="h-6 w-6 text-primary" />
                                </div>
                                <div className="text-sm">
                                    <span className="font-semibold text-primary">Click to upload Excel</span> or drag and drop
                                </div>
                                <p className="text-xs text-muted-foreground">.xlsx or .xls files only</p>
                            </div>
                        </div>

                        {importData.length > 0 && (
                            <div className="bg-muted p-3 rounded-lg flex items-center justify-between animate-in fade-in slide-in-from-bottom-2">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <div className="h-8 w-8 bg-green-100 text-green-700 rounded flex items-center justify-center shrink-0">
                                        <CheckCircle2 size={16} />
                                    </div>
                                    <div className="truncate">
                                        <p className="text-xs font-semibold truncate">{importFileName}</p>
                                        <p className="text-[10px] text-muted-foreground">{importData.length} records detected</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => { setImportData([]); setImportFileName(""); }} className="text-destructive">Remove</Button>
                            </div>
                        )}
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="ghost" onClick={() => { setIsImportOpen(false); setImportData(""); }}>Cancel</Button>
                        <Button onClick={handleImport} disabled={isSaving || !importData} className="px-8 shadow-md">
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                            Process Import
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
