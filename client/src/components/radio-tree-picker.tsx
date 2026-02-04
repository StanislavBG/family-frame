import { useState } from "react";
import { ChevronRight, ChevronDown, Radio, Folder, FolderOpen, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { RadioTreeNode } from "@shared/schema";
import { isRadioStation } from "@shared/schema";

interface RadioTreePickerProps {
  tree: RadioTreeNode;
  selectedUrl?: string;
  onSelect: (url: string, name: string) => void;
}

interface TreeNodeProps {
  node: RadioTreeNode;
  level: number;
  selectedUrl?: string;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (url: string, name: string) => void;
}

function TreeNode({ node, level, selectedUrl, expandedIds, onToggle, onSelect }: TreeNodeProps) {
  const isStation = isRadioStation(node);
  const isExpanded = expandedIds.has(node.id);
  const isSelected = isStation && node.url === selectedUrl;
  const hasChildren = node.children && node.children.length > 0;

  const handleClick = () => {
    if (isStation && node.url) {
      onSelect(node.url, node.name);
    } else if (hasChildren) {
      onToggle(node.id);
    }
  };

  return (
    <div>
      <Button
        variant="ghost"
        className={cn(
          "w-full justify-start gap-2 h-10 px-2 hover-elevate",
          isSelected && "bg-primary/10 text-primary",
          level > 0 && "ml-4"
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
        data-testid={`radio-node-${node.id}`}
      >
        {hasChildren ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-amber-500" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" />
            <Radio className={cn("h-4 w-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
          </>
        )}
        <span className={cn("truncate", isSelected && "font-medium")}>{node.name}</span>
        {isSelected && (
          <Play className="h-3 w-3 ml-auto text-primary animate-pulse" />
        )}
      </Button>

      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedUrl={selectedUrl}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function RadioTreePicker({ tree, selectedUrl, onSelect }: RadioTreePickerProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (tree.children && tree.children.length > 0) {
      initial.add(tree.children[0].id);
    }
    return initial;
  });

  const handleToggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <ScrollArea className="h-[300px] rounded-md border">
      <div className="p-2">
        {tree.children?.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            level={0}
            selectedUrl={selectedUrl}
            expandedIds={expandedIds}
            onToggle={handleToggle}
            onSelect={onSelect}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
