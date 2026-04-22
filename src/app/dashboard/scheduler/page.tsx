"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, CalendarClock, RefreshCw, Users, User, Send, Info, Clock, Repeat, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import moment from "moment-timezone";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SearchFilter } from "@/components/dashboard/search-filter";
import { useSession } from "@/components/dashboard/session-provider";
import { SessionGuard } from "@/components/dashboard/session-guard";
import { Badge } from "@/components/ui/badge";

interface ScheduledMessage {
    id: string;
    jid: string;
    content: string;
    sendAt: string;
    status: string;
    mediaUrl?: string;
    mediaType?: string;
    type: string;
    scheduleType: string;
}

export default function SchedulerPage() {
    const { sessionId: selectedSessionId } = useSession();

    const [messages, setMessages] = useState<ScheduledMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [systemTimezone, setSystemTimezone] = useState("Asia/Jakarta");

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [availableTags, setAvailableTags] = useState<string[]>([]);
    const [availableContacts, setAvailableContacts] = useState<any[]>([]);
    const [newJid, setNewJid] = useState("");
    const [newContent, setNewContent] = useState("");
    const [newSendAt, setNewSendAt] = useState("");
    const [newMediaUrl, setNewMediaUrl] = useState("");
    const [newMediaType, setNewMediaType] = useState("image");
    const [newType, setNewType] = useState("individual");
    const [newScheduleType, setNewScheduleType] = useState("once");

    // Delete state
    const [deleteId, setDeleteId] = useState<string | null>(null);

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/settings/system')
            .then(res => res.json())
            .then(data => {
                if (data.status && data.data?.timezone) {
                    setSystemTimezone(data.data.timezone);
                }
            })
            .catch(() => { });

        if (selectedSessionId) {
            fetchMessages(selectedSessionId);
            fetchPhonebookData(selectedSessionId);
        } else {
            setMessages([]);
        }
    }, [selectedSessionId]);

    const fetchPhonebookData = async (sessionId: string) => {
        // Fetch Tags
        fetch(`/api/phonebook/${sessionId}?type=tags`)
            .then(res => res.json())
            .then(d => setAvailableTags(d.data || []))
            .catch(() => {});
        
        // Fetch All manual contacts for selection
        fetch(`/api/phonebook/${sessionId}?limit=all`)
            .then(res => res.json())
            .then(d => setAvailableContacts(d.data || []))
            .catch(() => {});
    };

    const fetchMessages = async (sessionId: string) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/scheduler/${sessionId}`);
            if (res.ok) {
                const data = await res.json();
                setMessages(data?.data || []);
            } else {
                setMessages([]);
            }
        } catch (error) {
            toast.error("Failed to fetch scheduled messages");
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (msg: ScheduledMessage) => {
        setEditingId(msg.id);
        setNewJid(msg.jid.split('@')[0]);
        setNewContent(msg.content);
        setNewMediaUrl(msg.mediaUrl || "");
        setNewMediaType(msg.mediaType || "image");
        setNewType(msg.type || "individual");
        setNewScheduleType(msg.scheduleType || "once");

        const localIso = moment.tz(msg.sendAt, systemTimezone).format('YYYY-MM-DDTHH:mm');
        setNewSendAt(localIso);

        setShowForm(true);
    };

    const handleSaveSchedule = async () => {
        if (!selectedSessionId || !newJid || !newContent || !newSendAt) return;

        let jid = newJid;
        if (newType === 'individual' && !jid.includes("@")) {
            jid = jid.includes("-") ? `${jid}@g.us` : `${jid}@s.whatsapp.net`;
        }

        try {
            const url = editingId
                ? `/api/scheduler/${selectedSessionId}/${editingId}`
                : `/api/scheduler/${selectedSessionId}`;

            const method = editingId ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jid,
                    content: newContent,
                    sendAt: newSendAt,
                    mediaUrl: newMediaUrl,
                    mediaType: newMediaType,
                    type: newType,
                    scheduleType: newScheduleType
                })
            });

            if (res.ok) {
                toast.success(editingId ? "Schedule updated" : "Message scheduled");
                setShowForm(false);
                resetForm();
                fetchMessages(selectedSessionId);
            } else {
                toast.error("Failed to save schedule");
            }
        } catch (error) {
            toast.error("An error occurred");
        }
    };

    const resetForm = () => {
        setNewJid("");
        setNewContent("");
        setNewSendAt("");
        setNewMediaUrl("");
        setNewMediaType("image");
        setNewType("individual");
        setNewScheduleType("once");
        setEditingId(null);
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            const res = await fetch(`/api/scheduler/${selectedSessionId}/${deleteId}`, { method: "DELETE" });
            if (res.ok) {
                toast.success("Schedule cancelled");
                setMessages(messages.filter(m => m.id !== deleteId));
            } else {
                toast.error("Failed to cancel schedule");
            }
        } catch (error) {
            toast.error("An error occurred");
        } finally {
            setDeleteId(null);
        }
    };

    const filteredMessages = messages.filter(m =>
        m.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.jid.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <SessionGuard>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <CalendarClock className="h-6 w-6 text-primary" /> Automation Scheduler
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Manage message cycles and automated blasts.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Button variant="outline" size="sm" onClick={() => selectedSessionId && fetchMessages(selectedSessionId)} disabled={loading || !selectedSessionId}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                        <Button size="sm" onClick={() => { resetForm(); setShowForm(!showForm); }} disabled={!selectedSessionId}>
                            <Plus className="h-4 w-4 mr-2" /> New Task
                        </Button>
                    </div>
                </div>

                {showForm && (
                    <Card className="border-2 border-primary/10 shadow-lg animate-in slide-in-from-top duration-300">
                        <CardHeader className="bg-muted/30">
                            <CardTitle className="text-lg">{editingId ? "Edit Task" : "Create New Automated Task"}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2 col-span-1">
                                    <Label>Task Type</Label>
                                    <Select value={newType} onValueChange={setNewType}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="individual">Individual / Manual Entry</SelectItem>
                                            <SelectItem value="blast">Broadcast to Contact Tag</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2 col-span-1 md:col-span-2">
                                    <Label>{newType === 'blast' ? 'Target Tag Group' : 'Recipient Selection'}</Label>
                                    <div className="flex gap-2">
                                        <Select value={newJid} onValueChange={setNewJid}>
                                            <SelectTrigger className="flex-1">
                                                <SelectValue placeholder={newType === 'blast' ? "Pick a tag group..." : "Pick a contact..."} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {newType === 'blast' ? (
                                                    availableTags.map(tag => (
                                                        <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                                                    ))
                                                ) : (
                                                    availableContacts.map(c => (
                                                        <SelectItem key={c.id} value={c.number}>{c.name || c.number} ({c.number})</SelectItem>
                                                    ))
                                                )}
                                                {newType === 'individual' && (
                                                    <SelectItem value="__MANUAL__">--- Type Manually ---</SelectItem>
                                                )}
                                            </SelectContent>
                                        </Select>
                                        
                                        {((newType === 'individual' && newJid === '__MANUAL__') || (availableTags.length === 0 && newType === 'blast')) && (
                                            <Input
                                                className="flex-1"
                                                value={newJid === '__MANUAL__' ? "" : newJid}
                                                onChange={e => setNewJid(e.target.value)}
                                                placeholder={newType === 'blast' ? "Enter Tag Name" : "Enter Phone/ID"}
                                                onBlur={(e) => { if (!e.target.value) setNewJid("") }}
                                            />
                                        )}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground italic">
                                        {newType === 'blast' 
                                            ? "Messages will be sent to all contacts in the Manual Phonebook matching this tag." 
                                            : "Choose a contact from Phonebook or enter a new number."}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Start Time</Label>
                                    <Input type="datetime-local" value={newSendAt} onChange={e => setNewSendAt(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Repetition Cycle</Label>
                                    <Select value={newScheduleType} onValueChange={setNewScheduleType}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="once">Once (One-time delivery)</SelectItem>
                                            <SelectItem value="every_day">Daily (Every 24 hours)</SelectItem>
                                            <SelectItem value="working_days">Working Days (Mon - Fri)</SelectItem>
                                            <SelectItem value="holidays">Weekends (Sat - Sun)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Message Content</Label>
                                <Textarea
                                    value={newContent}
                                    onChange={e => setNewContent(e.target.value)}
                                    placeholder="Type your message here..."
                                    rows={4}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Media Attachment URL (Optional)</Label>
                                    <Input value={newMediaUrl} onChange={e => setNewMediaUrl(e.target.value)} placeholder="https://..." />
                                </div>
                                <div className="space-y-2">
                                    <Label>Attachment Type</Label>
                                    <Select value={newMediaType} onValueChange={setNewMediaType}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="image">Image</SelectItem>
                                            <SelectItem value="video">Video</SelectItem>
                                            <SelectItem value="document">Document</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="ghost" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
                                <Button onClick={handleSaveSchedule} className="px-8">{editingId ? "Update Task" : "Start Task"}</Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                <SearchFilter placeholder="Search tasks by content or target..." onSearch={setSearchTerm} />

                {loading ? (
                    <div className="flex justify-center p-12"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>
                ) : filteredMessages.length === 0 ? (
                    <Card className="bg-muted/20 border-dashed border-2">
                        <CardContent className="h-40 flex flex-col items-center justify-center text-muted-foreground">
                            <Info className="h-8 w-8 mb-2 opacity-20" />
                            <p>No active scheduled tasks found.</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-4">
                        {filteredMessages.map(msg => (
                            <Card key={msg.id} className={`overflow-hidden transition-all hover:shadow-md ${msg.status === 'SENT' ? 'bg-muted/10 opacity-75' : ''}`}>
                                <div className={`h-1 w-full ${
                                    msg.status === 'PENDING' ? 'bg-yellow-400' : 
                                    msg.status === 'SENT' ? 'bg-green-500' : 
                                    msg.status === 'SENDING' ? 'bg-blue-500 animate-pulse' : 'bg-red-500'
                                }`} />
                                <CardContent className="p-4">
                                    <div className="flex flex-col md:flex-row justify-between gap-4">
                                        <div className="flex-1 space-y-2">
                                            <div className="flex items-center flex-wrap gap-2">
                                                <Badge variant={msg.type === 'blast' ? "default" : "outline"} className="flex gap-1 items-center font-bold">
                                                    {msg.type === 'blast' ? <Users size={12} /> : <User size={12} />}
                                                    {msg.type.toUpperCase()}
                                                </Badge>
                                                <span className="font-mono text-sm text-primary font-bold">
                                                    {msg.jid.split('@')[0]}
                                                </span>
                                                <Badge variant="secondary" className="text-[10px] uppercase font-bold">
                                                    {msg.status}
                                                </Badge>
                                            </div>
                                            
                                            <p className="text-sm line-clamp-2">{msg.content}</p>
                                            
                                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground font-medium">
                                                <span className="flex items-center gap-1"><Clock size={12} /> {new Date(msg.sendAt).toLocaleString()}</span>
                                                <span className="flex items-center gap-1 uppercase tracking-wider"><Repeat size={12} /> {msg.scheduleType?.replace('_', ' ')}</span>
                                            </div>
                                        </div>
                                        
                                        <div className="flex md:flex-col justify-end gap-2 shrink-0">
                                            <Button variant="outline" size="sm" onClick={() => handleEdit(msg)} disabled={msg.status === 'SENDING'}>
                                                Edit
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => setDeleteId(msg.id)} title="Cancel" className="text-destructive hover:bg-red-50">
                                                <Trash2 size={16} />
                                            </Button>
                                        </div>
                                    </div>
                                    {msg.status === 'FAILED' && (
                                        <div className="mt-3 p-2 bg-red-50 rounded border border-red-100 flex items-start gap-2">
                                            <AlertCircle size={14} className="text-red-500 mt-0.5" />
                                            <span className="text-[10px] text-red-600 font-medium">Error: {(msg as any).errorMessage || 'Unknown failure'}</span>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete Task?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Are you sure you want to cancel and delete this scheduled task?
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Keep Task</AlertDialogCancel>
                            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete Permanently</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </SessionGuard>
    );
}
