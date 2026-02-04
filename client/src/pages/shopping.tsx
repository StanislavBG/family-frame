import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ShoppingCart, Plus, Trash2, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface ShoppingItem {
  id: string;
  name: string;
  aisle: string;
  checked: boolean;
}

interface ShoppingList {
  items: ShoppingItem[];
}

const AISLES = [
  { id: "produce", name: "Produce", color: "bg-green-500" },
  { id: "dairy", name: "Dairy & Eggs", color: "bg-blue-400" },
  { id: "bakery", name: "Bakery", color: "bg-amber-500" },
  { id: "meat", name: "Meat", color: "bg-red-400" },
  { id: "pantry", name: "Pantry", color: "bg-orange-400" },
];

const ITEMS_BY_AISLE: Record<string, string[]> = {
  produce: ["Carrots", "Potatoes", "Broccoli", "Pumpkin", "Onions", "Tomatoes", "Cucumbers"],
  dairy: ["Milk", "Cheese", "Eggs", "Butter", "Yogurt"],
  bakery: ["Bread", "Flour", "Rolls"],
  meat: ["Chicken", "Ground Beef"],
  pantry: ["Rice", "Pasta", "Oil"],
};

export default function ShoppingPage() {
  const [selectedAisle, setSelectedAisle] = useState<string>("produce");
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);

  const { data: savedList } = useQuery<ShoppingList>({
    queryKey: ["/api/shopping"],
  });

  const saveMutation = useMutation({
    mutationFn: async (items: ShoppingItem[]) => {
      return apiRequest("POST", "/api/shopping", { items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopping"] });
    },
  });

  useEffect(() => {
    if (savedList?.items) {
      setShoppingList(savedList.items);
    }
  }, [savedList]);

  const addItem = (itemName: string, aisle: string) => {
    const exists = shoppingList.some(
      (item) => item.name.toLowerCase() === itemName.toLowerCase()
    );
    if (exists) return;

    const newItem: ShoppingItem = {
      id: `${Date.now()}`,
      name: itemName,
      aisle,
      checked: false,
    };
    const newList = [...shoppingList, newItem];
    setShoppingList(newList);
    saveMutation.mutate(newList);
  };

  const removeItem = (id: string) => {
    const newList = shoppingList.filter((item) => item.id !== id);
    setShoppingList(newList);
    saveMutation.mutate(newList);
  };

  const toggleItem = (id: string) => {
    const newList = shoppingList.map((item) =>
      item.id === id ? { ...item, checked: !item.checked } : item
    );
    setShoppingList(newList);
    saveMutation.mutate(newList);
  };

  const clearChecked = () => {
    const newList = shoppingList.filter((item) => !item.checked);
    setShoppingList(newList);
    saveMutation.mutate(newList);
  };

  const clearAll = () => {
    setShoppingList([]);
    saveMutation.mutate([]);
  };

  const getAisleColor = (aisleId: string) => {
    return AISLES.find((a) => a.id === aisleId)?.color || "bg-gray-400";
  };

  const uncheckedItems = shoppingList.filter((item) => !item.checked);
  const checkedItems = shoppingList.filter((item) => item.checked);

  return (
    <div className="h-full flex flex-col overflow-hidden p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            Shopping List
          </h1>
        </div>
        {shoppingList.length > 0 && (
          <div className="flex gap-2">
            {checkedItems.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearChecked}
                data-testid="button-clear-checked"
              >
                Clear Done
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="text-muted-foreground"
              data-testid="button-clear-all"
            >
              Clear All
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Shopping List */}
        <Card className="flex-1 p-6 overflow-auto">
          {shoppingList.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <ShoppingCart className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-xl">Your list is empty</p>
              <p className="text-sm mt-2">Add items from the right panel</p>
            </div>
          ) : (
            <div className="space-y-2">
              {uncheckedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover-elevate"
                  data-testid={`list-item-${item.id}`}
                >
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => toggleItem(item.id)}
                    className="h-8 w-8 rounded-full border-2"
                    data-testid={`button-check-${item.id}`}
                  >
                    <span className="sr-only">Mark done</span>
                  </Button>
                  <div
                    className={`w-2 h-8 rounded-full ${getAisleColor(item.aisle)}`}
                  />
                  <span className="flex-1 text-lg font-medium">{item.name}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeItem(item.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    data-testid={`button-remove-${item.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              {checkedItems.length > 0 && (
                <>
                  <div className="pt-4 pb-2">
                    <span className="text-sm text-muted-foreground">
                      Done ({checkedItems.length})
                    </span>
                  </div>
                  {checkedItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-3 rounded-lg opacity-50"
                      data-testid={`list-item-done-${item.id}`}
                    >
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => toggleItem(item.id)}
                        className="h-8 w-8 rounded-full bg-primary text-primary-foreground"
                        data-testid={`button-uncheck-${item.id}`}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <div
                        className={`w-2 h-8 rounded-full ${getAisleColor(item.aisle)}`}
                      />
                      <span className="flex-1 text-lg line-through">
                        {item.name}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeItem(item.id)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        data-testid={`button-remove-done-${item.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </Card>

        {/* Item Picker */}
        <div className="w-80 flex flex-col gap-4">
          {/* Aisle Tabs */}
          <div className="flex flex-wrap gap-2">
            {AISLES.map((aisle) => (
              <Button
                key={aisle.id}
                variant={selectedAisle === aisle.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedAisle(aisle.id)}
                className="flex items-center gap-2"
                data-testid={`button-aisle-${aisle.id}`}
              >
                <div className={`w-2 h-2 rounded-full ${aisle.color}`} />
                {aisle.name}
              </Button>
            ))}
          </div>

          {/* Items Grid */}
          <Card className="flex-1 p-4 overflow-auto">
            <div className="grid grid-cols-2 gap-2">
              {ITEMS_BY_AISLE[selectedAisle]?.map((itemName) => {
                const isInList = shoppingList.some(
                  (item) => item.name.toLowerCase() === itemName.toLowerCase()
                );
                return (
                  <Button
                    key={itemName}
                    variant={isInList ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => addItem(itemName, selectedAisle)}
                    disabled={isInList}
                    className="justify-start gap-2 h-auto py-3"
                    data-testid={`button-add-${itemName.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    {isInList ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    {itemName}
                  </Button>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
