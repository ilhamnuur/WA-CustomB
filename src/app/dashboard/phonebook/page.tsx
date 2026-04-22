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

import { Search, Loader2, UserPlus, Tag, Folder, Phone, Edit, Trash2, Upload, HelpCircle } from "lucide-react";
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
    const [importData, setImportData] = useState("");
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
        if (!sessionId || !importData) return;
        
        setIsSaving(true);
        try {
            // Basic CSV parsing: Name, Number, Category, Tags
            const lines = importData.split("\n").filter(l => l.trim());
            const parsed = lines.map(line => {
                const [name, number, category, tags] = line.split(",").map(s => s?.trim());
                return { name, number, category, tags };
            }).filter(c => c.number);

            const res = await fetch(`/api/phonebook/${sessionId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(parsed)
            });

            if (res.ok) {
                toast.success(`Imported ${parsed.length} contacts`);
                setIsImportOpen(false);
                setImportData("");
                fetchContacts();
            } else {
                toast.error("Import failed");
            }
        } catch (error) {
            toast.error("Format error in CSV data");
        } finally {
            setIsSaving(false);
        }
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
                <div className="flex gap-2 w-full md:w-auto">
                    <Button variant="outline" onClick={() => setIsImportOpen(true)} disabled={!sessionId}>
                        <Upload className="mr-2 h-4 w-4" /> Import CSV
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
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            Bulk Import Contacts
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Format: Name, Number, Category, Tags</p>
                                        <p>Example: John, 62812, VIP, TAG1</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </DialogTitle>
                        <DialogDescription>
                            Paste your data in a CSV format (Name, Number, Category, Tags). One entry per line.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Textarea 
                            placeholder="John Doe, 628123456789, Customer, VIP&#10;Jane Smith, 628987654321, Vendor, URGENT" 
                            className="min-h-[300px] font-mono text-sm"
                            value={importData}
                            onChange={e => setImportData(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsImportOpen(false)}>Cancel</Button>
                        <Button onClick={handleImport} disabled={isSaving || !importData}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Start Import
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
