"use client";

import { useState, useRef, useEffect } from "react";
import { useSession as useSessionAuth } from "next-auth/react";
import { useSession } from "@/components/dashboard/session-provider";
import { 
    Send, 
    FileSpreadsheet, 
    Upload, 
    X, 
    CheckCircle2, 
    AlertCircle, 
    Loader2, 
    Download, 
    Users,
    Trash2,
    Play,
    Pause,
    History,
    Search,
    RefreshCw,
    Settings,
    UserCheck,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SessionGuard } from "@/components/dashboard/session-guard";

interface ContactData {
    phone: string;
    [key: string]: string;
}

export default function CustomBlastPage() {
    const { data: authSession } = useSessionAuth();
    const { sessionId: selectedSessionId, loading: sessionLoading } = useSession();
    const [sendType, setSendType] = useState<"excel" | "phonebook">("excel");
    
    // Excel State
    const [excelData, setExcelData] = useState<ContactData[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [phoneColumn, setPhoneColumn] = useState<string>("");
    const [fileName, setFileName] = useState<string>("");
    
    // Phonebook State
    const [availableTags, setAvailableTags] = useState<string[]>([]);
    const [selectedTag, setSelectedTag] = useState<string>("");
    const [phonebookContacts, setPhonebookContacts] = useState<ContactData[]>([]);

    // Message State
    const [message, setMessage] = useState("");
    const [delay, setDelay] = useState(3);
    const [mediaUrl, setMediaUrl] = useState("");
    const [mediaType, setMediaType] = useState<"text" | "image" | "document">("text");

    // Execution State
    const [isBlasting, setIsBlasting] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [stats, setStats] = useState({ success: 0, failed: 0, total: 0 });
    const [logs, setLogs] = useState<{ phone: string, status: "success" | "error", message: string }[]>([]);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const isPausedRef = useRef(false);
    const stopRef = useRef(false);

    useEffect(() => {
        if (selectedSessionId) {
            fetchTags();
        }
    }, [selectedSessionId]);

    const fetchTags = async () => {
        if (!selectedSessionId) return;
        try {
            const res = await fetch(`/api/phonebook/${selectedSessionId}?type=tags`);
            const data = await res.json();
            if (data.status) setAvailableTags(data.data || []);
        } catch (error) {}
    };

    const fetchContactsByTag = async (tag: string) => {
        if (!selectedSessionId || !tag) return;
        try {
            const res = await fetch(`/api/phonebook/${selectedSessionId}?tag=${tag}&limit=all`);
            const data = await res.json();
            if (data.status) {
                const contacts: ContactData[] = data.data.map((c: any) => ({
                    phone: c.number,
                    Name: c.name || "",
                    Category: c.category || "",
                    Tags: c.tags || "",
                    JID: c.jid
                }));
                setPhonebookContacts(contacts);
                setHeaders(["Name", "Category", "Tags"]);
                setPhoneColumn("phone");
                setStats(prev => ({ ...prev, total: contacts.length }));
            }
        } catch (error) {
            toast.error("Failed to fetch phonebook contacts");
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: "array" });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as any[];

                if (jsonData.length === 0) {
                    toast.error("Excel file is empty");
                    return;
                }

                const fileHeaders = Object.keys(jsonData[0]);
                setHeaders(fileHeaders);
                setExcelData(jsonData);
                setStats(prev => ({ ...prev, total: jsonData.length }));

                // Auto-detect phone column
                const phonePatterns = ["phone", "telepon", "wa", "whatsapp", "number", "nomor", "hp"];
                const detected = fileHeaders.find(h => phonePatterns.some(p => h.toLowerCase().includes(p)));
                if (detected) setPhoneColumn(detected);

            } catch (error) {
                toast.error("Failed to parse Excel file");
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const insertVariable = (v: string) => {
        setMessage(prev => prev + `{${v}}`);
    };

    const formatMessage = (template: string, data: ContactData) => {
        let msg = template;
        Object.keys(data).forEach(key => {
            msg = msg.replace(new RegExp(`{${key}}`, 'g'), data[key] || "");
        });
        return msg;
    };

    const startBlast = async () => {
        const data = sendType === 'excel' ? excelData : phonebookContacts;
        if (!selectedSessionId) return toast.error("Please select a session");
        if (data.length === 0) return toast.error("No recipients found");
        if (!phoneColumn && sendType === 'excel') return toast.error("Please select the phone number column");
        if (!message) return toast.error("Please enter a message");

        setIsBlasting(true);
        setIsPaused(false);
        isPausedRef.current = false;
        stopRef.current = false;
        setLogs([]);
        setStats({ success: 0, failed: 0, total: data.length });

        for (let i = currentIndex; i < data.length; i++) {
            if (stopRef.current) break;
            
            while (isPausedRef.current) {
                await new Promise(r => setTimeout(r, 1000));
                if (stopRef.current) break;
            }

            setCurrentIndex(i);
            const recipient = data[i];
            const rawPhone = recipient[phoneColumn || "phone"];
            const cleanPhone = String(rawPhone).replace(/\D/g, "");
            const jid = `${cleanPhone}@s.whatsapp.net`;
            const personalizedMessage = formatMessage(message, recipient);

            try {
                const res = await fetch(`/api/chat/${selectedSessionId}/send`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        jid,
                        content: personalizedMessage,
                        mediaUrl,
                        type: mediaType === 'text' ? 'text' : mediaType
                    })
                });

                if (res.ok) {
                    setStats(prev => ({ ...prev, success: prev.success + 1 }));
                    setLogs(prev => [{ phone: cleanPhone, status: "success" as const, message: "Sent successfully" }, ...prev].slice(0, 50));
                } else {
                    throw new Error("Failed to send");
                }
            } catch (error) {
                setStats(prev => ({ ...prev, failed: prev.failed + 1 }));
                setLogs(prev => [{ phone: cleanPhone, status: "error" as const, message: "Failed to send" }, ...prev].slice(0, 50));
            }

            setProgress(Math.round(((i + 1) / data.length) * 100));

            if (i < data.length - 1) {
                const waitTime = (delay + Math.random() * 2) * 1000;
                await new Promise(r => setTimeout(r, waitTime));
            }
        }

        setIsBlasting(false);
        if (!stopRef.current) toast.success("Blast campaign completed!");
    };

    const togglePause = () => {
        isPausedRef.current = !isPausedRef.current;
        setIsPaused(isPausedRef.current);
    };

    const stopBlast = () => {
        stopRef.current = true;
        setIsBlasting(false);
        setIsPaused(false);
        toast.info("Blast campaign cancelled");
    };

    const downloadTemplate = () => {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([
            ["Nama", "Nomor", "Category", "Invoice", "Due_Date"],
            ["Budi", "6281234567890", "Customer", "INV-001", "2024-05-20"],
            ["Ani", "6289876543210", "Member", "INV-002", "2024-05-21"]
        ]);
        XLSX.utils.book_append_sheet(wb, ws, "Blast Template");
        XLSX.writeFile(wb, "custom_blast_template.xlsx");
    };

    return (
        <SessionGuard>
            <div className="space-y-6 max-w-7xl mx-auto pb-20">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-xl sm:text-3xl font-bold tracking-tight">Custom Blast</h2>
                        <p className="text-muted-foreground text-sm mt-1">
                            Kirim pesan personalisasi menggunakan variabel dari Excel atau Phonebook.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={downloadTemplate}>
                            <Download className="h-4 w-4 mr-2" /> Download Template
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Column: Configuration */}
                    <div className="lg:col-span-4 space-y-6">
                        <Card className="border-2 border-primary/10">
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Users className="h-5 w-5 text-primary" /> Target Audience
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Tabs value={sendType} onValueChange={(v: any) => setSendType(v)}>
                                    <TabsList className="grid grid-cols-2 w-full">
                                        <TabsTrigger value="excel">Excel Upload</TabsTrigger>
                                        <TabsTrigger value="phonebook">Phonebook Tag</TabsTrigger>
                                    </TabsList>
                                    
                                    <TabsContent value="excel" className="space-y-4 pt-4">
                                        <div 
                                            className="border-2 border-dashed border-primary/20 rounded-xl p-6 text-center hover:bg-primary/5 transition-colors cursor-pointer relative group"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            <input 
                                                type="file" 
                                                ref={fileInputRef} 
                                                className="hidden" 
                                                accept=".xlsx, .xls, .csv" 
                                                onChange={handleFileUpload}
                                            />
                                            {fileName ? (
                                                <div className="flex flex-col items-center gap-2">
                                                    <CheckCircle2 className="h-10 w-10 text-green-500" />
                                                    <p className="text-sm font-medium truncate max-w-full">{fileName}</p>
                                                    <Button variant="ghost" size="xs" onClick={(e) => { e.stopPropagation(); setFileName(""); setExcelData([]); }}>
                                                        Change File
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center gap-2">
                                                    <div className="p-3 bg-primary/10 rounded-full group-hover:scale-110 transition-transform">
                                                        <FileSpreadsheet className="h-8 w-8 text-primary" />
                                                    </div>
                                                    <p className="text-sm font-medium">Click to upload Excel</p>
                                                    <p className="text-xs text-muted-foreground">.xlsx or .csv supported</p>
                                                </div>
                                            )}
                                        </div>

                                        {excelData.length > 0 && (
                                            <div className="space-y-2">
                                                <Label>Phone Number Column</Label>
                                                <Select value={phoneColumn} onValueChange={setPhoneColumn}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select column..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {headers.map(h => (
                                                            <SelectItem key={h} value={h}>{h}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}
                                    </TabsContent>

                                    <TabsContent value="phonebook" className="space-y-4 pt-4">
                                        <div className="space-y-2">
                                            <Label>Select Contact Tag</Label>
                                            <Select value={selectedTag} onValueChange={(v) => { setSelectedTag(v); fetchContactsByTag(v); }}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Pick a tag..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableTags.map(t => (
                                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs text-muted-foreground italic">
                                                {phonebookContacts.length} contacts found with this tag.
                                            </p>
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </CardContent>
                        </Card>

                        <Card className="border-2 border-primary/10">
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Settings className="h-5 w-5 text-primary" /> Campaign Settings
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="flex justify-between">
                                        Delay (seconds)
                                        <span className="text-xs font-bold text-primary">{delay}s</span>
                                    </Label>
                                    <Input 
                                        type="range" 
                                        min="1" 
                                        max="60" 
                                        value={delay} 
                                        onChange={e => setDelay(parseInt(e.target.value))} 
                                    />
                                    <p className="text-[10px] text-muted-foreground">A random delay of 1-2s will be added to minimize spam detection.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Message Content Type</Label>
                                    <Select value={mediaType} onValueChange={(v: any) => setMediaType(v)}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="text">Just Text</SelectItem>
                                            <SelectItem value="image">Image + Caption</SelectItem>
                                            <SelectItem value="document">Document + Caption</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {mediaType !== 'text' && (
                                    <div className="space-y-2">
                                        <Label>{mediaType === 'image' ? 'Image URL' : 'Document URL'}</Label>
                                        <Input 
                                            placeholder="https://example.com/file.jpg" 
                                            value={mediaUrl} 
                                            onChange={e => setMediaUrl(e.target.value)}
                                        />
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column: Message & Execution */}
                    <div className="lg:col-span-8 space-y-6">
                        <Card className="border-2 border-primary/20 shadow-md">
                            <CardHeader className="bg-primary/5">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <CardTitle className="text-xl">Message Template</CardTitle>
                                        <CardDescription>Use {"{VariableName}"} for personalization</CardDescription>
                                    </div>
                                    <Badge variant="outline" className="bg-background">
                                        Row {currentIndex + 1} of {stats.total}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-6 space-y-4">
                                <div className="flex flex-wrap gap-2 mb-2 p-3 bg-muted/30 rounded-lg border border-dashed">
                                    <span className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1 w-full mb-1">
                                        <UserCheck className="h-3 w-3" /> Available Variables:
                                    </span>
                                    {headers.map(h => (
                                        <Button 
                                            key={h} 
                                            variant="secondary" 
                                            size="sm" 
                                            className="h-7 text-xs font-mono"
                                            onClick={() => insertVariable(h)}
                                        >
                                            {h}
                                        </Button>
                                    ))}
                                    {headers.length === 0 && (
                                        <p className="text-xs text-muted-foreground italic">Upload a file or pick a tag to see variables.</p>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Compose Message</Label>
                                        <Textarea 
                                            placeholder="Halo {Nama}, tagihan {Invoice} Anda jatuh tempo pada {Due_Date}..."
                                            className="min-h-[250px] font-medium leading-relaxed"
                                            value={message}
                                            onChange={e => setMessage(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Live Preview (First Row)</Label>
                                        <div className="min-h-[250px] p-4 rounded-lg bg-[#e5ddd5] dark:bg-slate-900 border overflow-y-auto whatsapp-bg">
                                            <div className="bg-white dark:bg-slate-800 p-3 rounded-tr-lg rounded-bl-lg rounded-br-lg shadow-sm max-w-[90%] relative message-triangle">
                                                {mediaType === 'image' && mediaUrl && (
                                                    <img src={mediaUrl} className="w-full rounded mb-2 h-32 object-cover" alt="Preview" />
                                                )}
                                                <div className="whitespace-pre-wrap text-sm">
                                                    {(sendType === 'excel' ? excelData[0] : phonebookContacts[0]) 
                                                        ? formatMessage(message || "Message will appear here...", (sendType === 'excel' ? excelData[0] : phonebookContacts[0]))
                                                        : "Please import data first."}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground text-right mt-1">
                                                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="bg-muted/30 border-t flex flex-col md:flex-row gap-4 p-6">
                                <div className="flex-1 w-full space-y-2">
                                    <div className="flex justify-between text-xs font-bold">
                                        <span>Campaign Progress</span>
                                        <span>{progress}%</span>
                                    </div>
                                    <Progress value={progress} className="h-3" />
                                    <div className="flex gap-4 text-xs">
                                        <span className="flex items-center gap-1 text-green-600 font-bold"><CheckCircle2 className="h-3 w-3" /> {stats.success} Success</span>
                                        <span className="flex items-center gap-1 text-destructive font-bold"><AlertCircle className="h-3 w-3" /> {stats.failed} Failed</span>
                                        <span className="text-muted-foreground ml-auto">Total: {stats.total}</span>
                                    </div>
                                </div>
                                <div className="flex gap-2 w-full md:w-auto shrink-0">
                                    {isBlasting ? (
                                        <>
                                            <Button variant="outline" onClick={togglePause}>
                                                {isPaused ? <Play className="h-4 w-4 mr-2" /> : <Pause className="h-4 w-4 mr-2" />}
                                                {isPaused ? "Resume" : "Pause"}
                                            </Button>
                                            <Button variant="destructive" onClick={stopBlast}>
                                                <X className="h-4 w-4 mr-2" /> Stop
                                            </Button>
                                        </>
                                    ) : (
                                        <Button 
                                            size="lg" 
                                            className="w-full md:w-auto px-10 shadow-lg shadow-primary/20"
                                            onClick={startBlast}
                                            disabled={!message || stats.total === 0}
                                        >
                                            <Send className="h-4 w-4 mr-2" /> Launch Campaign
                                        </Button>
                                    )}
                                </div>
                            </CardFooter>
                        </Card>

                        {/* Logs section */}
                        {logs.length > 0 && (
                            <Card>
                                <CardHeader className="py-3 items-center flex-row justify-between">
                                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                                        <History className="h-4 w-4" /> Live Campaign Logs
                                    </CardTitle>
                                    <Button variant="ghost" size="xs" onClick={() => setLogs([])}>Clear</Button>
                                </CardHeader>
                                <CardContent className="p-0 max-h-60 overflow-y-auto">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-muted text-muted-foreground sticky top-0">
                                            <tr>
                                                <th className="px-4 py-2">Phone</th>
                                                <th className="px-4 py-2">Status</th>
                                                <th className="px-4 py-2">Message</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {logs.map((log, idx) => (
                                                <tr key={idx} className="hover:bg-muted/50 transition-colors">
                                                    <td className="px-4 py-2 font-mono">{log.phone}</td>
                                                    <td className="px-4 py-2">
                                                        <Badge variant={log.status === 'success' ? 'secondary' : 'destructive'} className="text-[10px] h-4">
                                                            {log.status.toUpperCase()}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-4 py-2 truncate max-w-xs">{log.message}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>

            <style jsx global>{`
                .whatsapp-bg {
                    background-image: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png');
                    background-repeat: repeat;
                    background-size: 400px;
                }
                .message-triangle::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    right: -10px;
                    width: 0;
                    height: 0;
                    border-style: solid;
                    border-width: 10px 0 0 10px;
                    border-color: transparent transparent transparent white;
                }
                .dark .message-triangle::before {
                    border-color: transparent transparent transparent #1e293b;
                }
            `}</style>
        </SessionGuard>
    );
}
