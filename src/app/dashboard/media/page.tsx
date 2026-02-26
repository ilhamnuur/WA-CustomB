"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
    ImageIcon,
    Video,
    Music,
    FileText,
    Trash2,
    Search,
    Download,
    Eye,
    HardDrive,
    Files,
    CheckSquare,
    Square,
    X,
    RefreshCw,
    FolderOpen,
} from "lucide-react";

interface MediaFile {
    name: string;
    size: number;
    type: "image" | "video" | "audio" | "document";
    ext: string;
    sessionId: string;
    createdAt: string;
    modifiedAt: string;
    url: string;
}

interface MediaListResponse {
    files: MediaFile[];
    totalSize: number;
    totalCount: number;
}

function formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getTypeIcon(type: string) {
    switch (type) {
        case "image": return <ImageIcon className="h-5 w-5 text-blue-500" />;
        case "video": return <Video className="h-5 w-5 text-purple-500" />;
        case "audio": return <Music className="h-5 w-5 text-orange-500" />;
        default: return <FileText className="h-5 w-5 text-emerald-500" />;
    }
}

function getTypeBg(type: string) {
    switch (type) {
        case "image": return "bg-blue-500/10";
        case "video": return "bg-purple-500/10";
        case "audio": return "bg-orange-500/10";
        default: return "bg-emerald-500/10";
    }
}

export default function MediaPage() {
    const [files, setFiles] = useState<MediaFile[]>([]);
    const [totalSize, setTotalSize] = useState(0);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterType, setFilterType] = useState<string>("all");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState(false);
    const [previewFile, setPreviewFile] = useState<MediaFile | null>(null);

    const fetchMedia = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/media");
            if (!res.ok) throw new Error("Failed to fetch");
            const data: MediaListResponse = await res.json();
            setFiles(data.files);
            setTotalSize(data.totalSize);
            setTotalCount(data.totalCount);
        } catch (error) {
            console.error("Failed to load media:", error);
            toast.error("Failed to load media files");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMedia();
    }, []);

    const filteredFiles = useMemo(() => {
        return files.filter((f) => {
            const matchSearch = !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase()) || f.sessionId.toLowerCase().includes(searchQuery.toLowerCase());
            const matchType = filterType === "all" || f.type === filterType;
            return matchSearch && matchType;
        });
    }, [files, searchQuery, filterType]);

    const toggleSelect = (name: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const selectAll = () => {
        if (selected.size === filteredFiles.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(filteredFiles.map((f) => f.name)));
        }
    };

    const handleDelete = async () => {
        if (selected.size === 0) return;
        if (!confirm(`Delete ${selected.size} file(s)? This cannot be undone.`)) return;

        setDeleting(true);
        try {
            const res = await fetch("/api/media", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filenames: Array.from(selected) }),
            });

            if (!res.ok) throw new Error("Failed to delete");

            const data = await res.json();
            toast.success(`Deleted ${data.deleted} file(s)`);
            if (data.failed > 0) {
                toast.warning(`Failed to delete ${data.failed} file(s)`);
            }
            setSelected(new Set());
            fetchMedia();
        } catch (error) {
            toast.error("Failed to delete files");
        } finally {
            setDeleting(false);
        }
    };

    // Stats by type
    const stats = useMemo(() => {
        const result = { image: 0, video: 0, audio: 0, document: 0 };
        files.forEach((f) => result[f.type]++);
        return result;
    }, [files]);

    return (
        <div className="space-y-4 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Media Manager</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Manage downloaded media files
                    </p>
                </div>
                <Button variant="outline" size="sm" className="gap-2 self-start" onClick={fetchMedia} disabled={loading}>
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="border-border/40">
                    <CardContent className="p-3 flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <HardDrive className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                            <p className="text-lg font-bold text-foreground">{formatFileSize(totalSize)}</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Size</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border/40">
                    <CardContent className="p-3 flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <Files className="h-4 w-4 text-blue-500" />
                        </div>
                        <div>
                            <p className="text-lg font-bold text-foreground">{totalCount}</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Files</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border/40">
                    <CardContent className="p-3 flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <ImageIcon className="h-4 w-4 text-blue-500" />
                        </div>
                        <div>
                            <p className="text-lg font-bold text-foreground">{stats.image}</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Images</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border/40">
                    <CardContent className="p-3 flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
                            <Video className="h-4 w-4 text-purple-500" />
                        </div>
                        <div>
                            <p className="text-lg font-bold text-foreground">{stats.video + stats.audio}</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Media</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        placeholder="Search by filename or session..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-9 pl-8 text-sm"
                    />
                </div>
                <div className="flex gap-1.5">
                    {["all", "image", "video", "audio", "document"].map((t) => (
                        <Button
                            key={t}
                            variant={filterType === t ? "default" : "outline"}
                            size="sm"
                            className="h-9 text-xs capitalize px-3"
                            onClick={() => setFilterType(t)}
                        >
                            {t}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Selection Actions */}
            {selected.size > 0 && (
                <div className="flex items-center gap-3 p-2.5 bg-destructive/5 border border-destructive/20 rounded-lg">
                    <span className="text-sm font-medium">{selected.size} selected</span>
                    <Button
                        variant="destructive"
                        size="sm"
                        className="gap-1.5 h-8"
                        onClick={handleDelete}
                        disabled={deleting}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        {deleting ? "Deleting..." : "Delete"}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelected(new Set())}>
                        <X className="h-3.5 w-3.5 mr-1" /> Clear
                    </Button>
                </div>
            )}

            {/* File Grid */}
            {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {Array.from({ length: 10 }).map((_, i) => (
                        <Skeleton key={i} className="h-40 rounded-lg" />
                    ))}
                </div>
            ) : filteredFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                        <FolderOpen className="h-7 w-7 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {searchQuery || filterType !== "all" ? "No media files match your filters" : "No media files downloaded yet"}
                    </p>
                </div>
            ) : (
                <>
                    {/* Select All */}
                    <div className="flex items-center gap-2 px-1">
                        <button onClick={selectAll} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                            {selected.size === filteredFiles.length ? (
                                <CheckSquare className="h-4 w-4 text-primary" />
                            ) : (
                                <Square className="h-4 w-4" />
                            )}
                            Select All ({filteredFiles.length})
                        </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {filteredFiles.map((file) => {
                            const isSelected = selected.has(file.name);
                            return (
                                <Card
                                    key={file.name}
                                    className={`group relative overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-md ${isSelected ? "ring-2 ring-primary border-primary" : "border-border/40 hover:border-border"
                                        }`}
                                    onClick={() => toggleSelect(file.name)}
                                >
                                    <CardContent className="p-0">
                                        {/* Preview/Icon Area */}
                                        <div className={`h-28 flex items-center justify-center ${getTypeBg(file.type)} relative`}>
                                            {file.type === "image" ? (
                                                <img
                                                    src={file.url}
                                                    alt={file.name}
                                                    className="h-full w-full object-cover"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <div className="flex flex-col items-center gap-1">
                                                    {getTypeIcon(file.type)}
                                                    <span className="text-[10px] text-muted-foreground uppercase font-medium">{file.ext}</span>
                                                </div>
                                            )}

                                            {/* Selection checkbox overlay */}
                                            <div className={`absolute top-1.5 left-1.5 transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                                                {isSelected ? (
                                                    <CheckSquare className="h-5 w-5 text-primary drop-shadow" />
                                                ) : (
                                                    <Square className="h-5 w-5 text-white/80 drop-shadow" />
                                                )}
                                            </div>

                                            {/* Quick Actions */}
                                            <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {file.type === "image" && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setPreviewFile(file); }}
                                                        className="h-7 w-7 rounded-md bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
                                                    >
                                                        <Eye className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                                <a
                                                    href={file.url}
                                                    download={file.name}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="h-7 w-7 rounded-md bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
                                                >
                                                    <Download className="h-3.5 w-3.5" />
                                                </a>
                                            </div>
                                        </div>

                                        {/* File Info */}
                                        <div className="p-2.5">
                                            <p className="text-xs font-medium text-foreground truncate" title={file.name}>
                                                {file.name}
                                            </p>
                                            <div className="flex items-center justify-between mt-1">
                                                <span className="text-[10px] text-muted-foreground">{formatFileSize(file.size)}</span>
                                                <span className="text-[10px] text-muted-foreground">
                                                    {new Date(file.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                                </span>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </>
            )}

            {/* Image Preview Modal */}
            {previewFile && (
                <div
                    className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
                    onClick={() => setPreviewFile(null)}
                >
                    <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                        <button
                            onClick={() => setPreviewFile(null)}
                            className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors"
                        >
                            <X className="h-6 w-6" />
                        </button>
                        <img
                            src={previewFile.url}
                            alt={previewFile.name}
                            className="max-h-[85vh] rounded-lg object-contain"
                        />
                        <p className="text-center text-white/60 text-sm mt-2">{previewFile.name}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
