import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import {
  ChefHat,
  Plus,
  Trash2,
  Clock,
  Users,
  Heart,
  HeartOff,
  Play,
  Pause,
  RotateCcw,
  Timer,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Edit,
  Volume2,
} from "lucide-react";
import type { Recipe, RecipeIngredient, RecipeStep } from "@shared/schema";

// Timer component for cooking steps
function CookingTimer({
  initialMinutes,
  label,
  onComplete,
}: {
  initialMinutes: number;
  label?: string;
  onComplete?: () => void;
}) {
  const [secondsRemaining, setSecondsRemaining] = useState(initialMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Create audio element for alarm
    audioRef.current = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU" + Array(1000).join("123"));
  }, []);

  useEffect(() => {
    if (!isRunning || secondsRemaining <= 0) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          setIsComplete(true);
          onComplete?.();
          // Play alarm sound (browser beep)
          try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = ctx.createOscillator();
            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(880, ctx.currentTime);
            oscillator.connect(ctx.destination);
            oscillator.start();
            oscillator.stop(ctx.currentTime + 0.5);
          } catch (e) {
            // Audio not supported
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, secondsRemaining, onComplete]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = ((initialMinutes * 60 - secondsRemaining) / (initialMinutes * 60)) * 100;

  const handleReset = () => {
    setSecondsRemaining(initialMinutes * 60);
    setIsRunning(false);
    setIsComplete(false);
  };

  return (
    <Card
      className={cn(
        "p-4 transition-all",
        isComplete && "bg-green-500/10 border-green-500",
        isRunning && "bg-primary/5 border-primary"
      )}
    >
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center",
            isComplete ? "bg-green-500" : "bg-primary/10"
          )}
        >
          <Timer className={cn("h-6 w-6", isComplete ? "text-white" : "text-primary")} />
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{label || "Timer"}</span>
            <span
              className={cn(
                "text-2xl font-mono tabular-nums",
                isComplete && "text-green-500",
                isRunning && "text-primary"
              )}
            >
              {formatTime(secondsRemaining)}
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-muted rounded-full mt-2 overflow-hidden">
            <div
              className={cn(
                "h-full transition-all",
                isComplete ? "bg-green-500" : "bg-primary"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex gap-2">
          {isComplete ? (
            <Button variant="outline" size="icon" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          ) : (
            <>
              <Button
                variant={isRunning ? "outline" : "default"}
                size="icon"
                onClick={() => setIsRunning(!isRunning)}
              >
                {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="icon" onClick={handleReset}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

// Recipe card for list view
function RecipeCard({
  recipe,
  onClick,
  onToggleFavorite,
  onDelete,
}: {
  recipe: Recipe;
  onClick: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}) {
  const totalTime = (recipe.prepTime || 0) + (recipe.cookTime || 0);

  return (
    <Card
      className="overflow-hidden hover:scale-[1.01] transition-all cursor-pointer"
      onClick={onClick}
    >
      {recipe.imageUrl && (
        <div className="h-40 bg-muted overflow-hidden">
          <img
            src={recipe.imageUrl}
            alt={recipe.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-medium line-clamp-1">{recipe.title}</h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
          >
            {recipe.isFavorite ? (
              <Heart className="h-5 w-5 text-red-500 fill-red-500" />
            ) : (
              <HeartOff className="h-5 w-5 text-muted-foreground" />
            )}
          </Button>
        </div>

        {recipe.description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {recipe.description}
          </p>
        )}

        <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
          {totalTime > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {totalTime} min
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {recipe.servings}
          </span>
          <span className="flex items-center gap-1">
            {recipe.ingredients.length} ingredients
          </span>
        </div>

        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {recipe.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {recipe.tags.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{recipe.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="mt-3 text-destructive hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Delete
        </Button>
      </div>
    </Card>
  );
}

// Cooking mode view
function CookingMode({
  recipe,
  onClose,
}: {
  recipe: Recipe;
  onClose: () => void;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const step = recipe.steps[currentStep];
  const isLastStep = currentStep === recipe.steps.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNextStep = () => {
    if (!isLastStep) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrevStep = () => {
    if (!isFirstStep) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const toggleStepComplete = (stepIndex: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepIndex)) {
        next.delete(stepIndex);
      } else {
        next.add(stepIndex);
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{recipe.title}</h1>
          <p className="text-sm text-muted-foreground">
            Step {currentStep + 1} of {recipe.steps.length}
          </p>
        </div>
        <Button variant="outline" onClick={onClose}>
          <X className="h-4 w-4 mr-2" />
          Exit Cooking Mode
        </Button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Step content */}
        <div className="flex-1 p-6 flex flex-col items-center justify-center">
          <div className="max-w-2xl w-full">
            <div className="flex items-center justify-between mb-4">
              <Badge variant="outline" className="text-lg py-2 px-4">
                Step {step?.order || currentStep + 1}
              </Badge>
              <Button
                variant={completedSteps.has(currentStep) ? "default" : "outline"}
                onClick={() => toggleStepComplete(currentStep)}
              >
                <Check className="h-4 w-4 mr-2" />
                {completedSteps.has(currentStep) ? "Done" : "Mark Done"}
              </Button>
            </div>

            <p className="text-2xl lg:text-3xl leading-relaxed mb-8">
              {step?.instruction || "No instruction"}
            </p>

            {/* Timer for this step */}
            {step?.duration && (
              <CookingTimer
                initialMinutes={step.duration}
                label={step.timerLabel || `Step ${currentStep + 1} Timer`}
                onComplete={() => {
                  // Auto-advance to next step when timer completes
                  if (!isLastStep) {
                    setTimeout(() => handleNextStep(), 2000);
                  }
                }}
              />
            )}
          </div>
        </div>

        {/* Ingredients sidebar */}
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l p-4 bg-muted/20">
          <h3 className="font-semibold mb-3">Ingredients</h3>
          <ScrollArea className="h-48 lg:h-full">
            <ul className="space-y-2">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="text-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                  <span className="font-medium">{ing.amount}</span>
                  {ing.unit && <span>{ing.unit}</span>}
                  <span>{ing.name}</span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>
      </div>

      {/* Navigation */}
      <div className="p-4 border-t flex items-center justify-between">
        <Button
          variant="outline"
          size="lg"
          onClick={handlePrevStep}
          disabled={isFirstStep}
        >
          <ChevronLeft className="h-5 w-5 mr-2" />
          Previous
        </Button>

        {/* Step indicators */}
        <div className="flex gap-2">
          {recipe.steps.map((_, i) => (
            <button
              key={i}
              className={cn(
                "w-3 h-3 rounded-full transition-all",
                i === currentStep
                  ? "bg-primary scale-125"
                  : completedSteps.has(i)
                  ? "bg-green-500"
                  : "bg-muted-foreground/30"
              )}
              onClick={() => setCurrentStep(i)}
            />
          ))}
        </div>

        <Button
          variant={isLastStep ? "default" : "outline"}
          size="lg"
          onClick={isLastStep ? onClose : handleNextStep}
        >
          {isLastStep ? (
            <>
              <Check className="h-5 w-5 mr-2" />
              Finish
            </>
          ) : (
            <>
              Next
              <ChevronRight className="h-5 w-5 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// Add/Edit recipe dialog
function RecipeDialog({
  open,
  onOpenChange,
  recipe,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipe?: Recipe;
  onSave: (recipe: Partial<Recipe>) => void;
}) {
  const [title, setTitle] = useState(recipe?.title || "");
  const [description, setDescription] = useState(recipe?.description || "");
  const [imageUrl, setImageUrl] = useState(recipe?.imageUrl || "");
  const [servings, setServings] = useState(recipe?.servings || 4);
  const [prepTime, setPrepTime] = useState(recipe?.prepTime || 0);
  const [cookTime, setCookTime] = useState(recipe?.cookTime || 0);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(
    recipe?.ingredients || []
  );
  const [steps, setSteps] = useState<RecipeStep[]>(recipe?.steps || []);
  const [tags, setTags] = useState(recipe?.tags?.join(", ") || "");

  const [newIngredient, setNewIngredient] = useState({ name: "", amount: "", unit: "" });
  const [newStep, setNewStep] = useState({ instruction: "", duration: 0 });

  const handleAddIngredient = () => {
    if (!newIngredient.name || !newIngredient.amount) return;
    setIngredients([...ingredients, { ...newIngredient }]);
    setNewIngredient({ name: "", amount: "", unit: "" });
  };

  const handleAddStep = () => {
    if (!newStep.instruction) return;
    setSteps([
      ...steps,
      {
        order: steps.length + 1,
        instruction: newStep.instruction,
        duration: newStep.duration || undefined,
      },
    ]);
    setNewStep({ instruction: "", duration: 0 });
  };

  const handleSave = () => {
    if (!title.trim()) return;

    onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      servings,
      prepTime: prepTime || undefined,
      cookTime: cookTime || undefined,
      ingredients,
      steps,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChefHat className="h-5 w-5" />
            {recipe ? "Edit Recipe" : "Add New Recipe"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Recipe Name</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Grandma's Apple Pie"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A brief description of the recipe..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="imageUrl">Image URL (optional)</Label>
              <Input
                id="imageUrl"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Servings</Label>
                <Input
                  type="number"
                  min={1}
                  value={servings}
                  onChange={(e) => setServings(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Prep Time (min)</Label>
                <Input
                  type="number"
                  min={0}
                  value={prepTime}
                  onChange={(e) => setPrepTime(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Cook Time (min)</Label>
                <Input
                  type="number"
                  min={0}
                  value={cookTime}
                  onChange={(e) => setCookTime(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g., dessert, easy, family favorite"
              />
            </div>
          </div>

          {/* Ingredients */}
          <div className="space-y-3">
            <Label>Ingredients</Label>
            {ingredients.length > 0 && (
              <div className="space-y-2">
                {ingredients.map((ing, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-muted/50 rounded p-2">
                    <span>{ing.amount} {ing.unit} {ing.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 ml-auto"
                      onClick={() => setIngredients(ingredients.filter((_, idx) => idx !== i))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="Amount"
                value={newIngredient.amount}
                onChange={(e) => setNewIngredient({ ...newIngredient, amount: e.target.value })}
                className="w-20"
              />
              <Input
                placeholder="Unit"
                value={newIngredient.unit}
                onChange={(e) => setNewIngredient({ ...newIngredient, unit: e.target.value })}
                className="w-20"
              />
              <Input
                placeholder="Ingredient name"
                value={newIngredient.name}
                onChange={(e) => setNewIngredient({ ...newIngredient, name: e.target.value })}
                className="flex-1"
              />
              <Button variant="outline" onClick={handleAddIngredient}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-3">
            <Label>Steps</Label>
            {steps.length > 0 && (
              <div className="space-y-2">
                {steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm bg-muted/50 rounded p-2">
                    <Badge variant="outline" className="flex-shrink-0">{i + 1}</Badge>
                    <span className="flex-1">{step.instruction}</span>
                    {step.duration && (
                      <Badge variant="secondary">
                        <Clock className="h-3 w-3 mr-1" />
                        {step.duration}m
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setSteps(steps.filter((_, idx) => idx !== i))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="Step instruction"
                value={newStep.instruction}
                onChange={(e) => setNewStep({ ...newStep, instruction: e.target.value })}
                className="flex-1"
              />
              <Input
                placeholder="Timer (min)"
                type="number"
                min={0}
                value={newStep.duration || ""}
                onChange={(e) => setNewStep({ ...newStep, duration: Number(e.target.value) })}
                className="w-24"
              />
              <Button variant="outline" onClick={handleAddStep}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Button onClick={handleSave} className="w-full" disabled={!title.trim()}>
            {recipe ? "Save Changes" : "Add Recipe"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function RecipesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [cookingRecipe, setCookingRecipe] = useState<Recipe | null>(null);
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: recipes = [], isLoading } = useQuery<Recipe[]>({
    queryKey: ["/api/recipes"],
  });

  const saveMutation = useMutation({
    mutationFn: async (updatedRecipes: Recipe[]) => {
      await apiRequest("POST", "/api/recipes", { recipes: updatedRecipes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save recipes",
        variant: "destructive",
      });
    },
  });

  const handleAddRecipe = (recipeData: Partial<Recipe>) => {
    const newRecipe: Recipe = {
      id: crypto.randomUUID(),
      title: recipeData.title || "",
      description: recipeData.description,
      imageUrl: recipeData.imageUrl,
      servings: recipeData.servings || 4,
      prepTime: recipeData.prepTime,
      cookTime: recipeData.cookTime,
      ingredients: recipeData.ingredients || [],
      steps: recipeData.steps || [],
      tags: recipeData.tags || [],
      isFavorite: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveMutation.mutate([...recipes, newRecipe]);
    toast({
      title: "Recipe added",
      description: `"${newRecipe.title}" has been saved`,
    });
  };

  const handleToggleFavorite = (recipeId: string) => {
    const updatedRecipes = recipes.map((recipe) => {
      if (recipe.id === recipeId) {
        return { ...recipe, isFavorite: !recipe.isFavorite };
      }
      return recipe;
    });
    saveMutation.mutate(updatedRecipes);
  };

  const handleDeleteRecipe = (recipeId: string) => {
    const recipe = recipes.find((r) => r.id === recipeId);
    const updatedRecipes = recipes.filter((r) => r.id !== recipeId);
    saveMutation.mutate(updatedRecipes);

    if (recipe) {
      toast({
        title: "Deleted",
        description: `"${recipe.title}" has been removed`,
      });
    }
  };

  const filteredRecipes = recipes.filter((recipe) => {
    if (filter === "favorites") return recipe.isFavorite;
    return true;
  });

  // Show cooking mode if a recipe is selected for cooking
  if (cookingRecipe) {
    return <CookingMode recipe={cookingRecipe} onClose={() => setCookingRecipe(null)} />;
  }

  // Recipe detail view
  if (selectedRecipe) {
    const totalTime = (selectedRecipe.prepTime || 0) + (selectedRecipe.cookTime || 0);

    return (
      <div className="h-full flex flex-col bg-background">
        <div className="p-6 border-b">
          <Button variant="ghost" onClick={() => setSelectedRecipe(null)} className="mb-4">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to recipes
          </Button>

          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{selectedRecipe.title}</h1>
              {selectedRecipe.description && (
                <p className="text-muted-foreground mt-1">{selectedRecipe.description}</p>
              )}

              <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                {totalTime > 0 && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {totalTime} min total
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {selectedRecipe.servings} servings
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleToggleFavorite(selectedRecipe.id)}
              >
                {selectedRecipe.isFavorite ? (
                  <Heart className="h-4 w-4 text-red-500 fill-red-500" />
                ) : (
                  <Heart className="h-4 w-4" />
                )}
              </Button>
              <Button onClick={() => setCookingRecipe(selectedRecipe)} size="lg">
                <ChefHat className="h-5 w-5 mr-2" />
                Start Cooking
              </Button>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 p-6">
          <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-8">
            {/* Ingredients */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Ingredients</h2>
              <Card className="p-4">
                <ul className="space-y-3">
                  {selectedRecipe.ingredients.map((ing, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                      <span>
                        <strong>{ing.amount}</strong>
                        {ing.unit && ` ${ing.unit}`} {ing.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            {/* Steps */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Steps</h2>
              <div className="space-y-4">
                {selectedRecipe.steps.map((step, i) => (
                  <Card key={i} className="p-4">
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className="flex-shrink-0">
                        {step.order}
                      </Badge>
                      <div className="flex-1">
                        <p>{step.instruction}</p>
                        {step.duration && (
                          <Badge variant="secondary" className="mt-2">
                            <Timer className="h-3 w-3 mr-1" />
                            {step.duration} min
                          </Badge>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-6 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <ChefHat className="h-6 w-6 text-amber-500" />
              Family Recipes
            </h1>
            <p className="text-muted-foreground mt-1">
              {recipes.length} recipe{recipes.length !== 1 && "s"}
              {recipes.filter((r) => r.isFavorite).length > 0 &&
                ` • ${recipes.filter((r) => r.isFavorite).length} favorites`}
            </p>
          </div>

          <Button onClick={() => setDialogOpen(true)} size="lg">
            <Plus className="h-5 w-5 mr-2" />
            Add Recipe
          </Button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mt-4">
          {(["all", "favorites"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f === "all" && "All Recipes"}
              {f === "favorites" && (
                <>
                  <Heart className="h-4 w-4 mr-1" />
                  Favorites
                </>
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* Recipe grid */}
      <ScrollArea className="flex-1 p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Clock className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredRecipes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ChefHat className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">
              {filter === "favorites" ? "No favorite recipes yet" : "No recipes yet"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {filter === "all" && "Add your first family recipe to get started"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {filteredRecipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onClick={() => setSelectedRecipe(recipe)}
                onToggleFavorite={() => handleToggleFavorite(recipe.id)}
                onDelete={() => handleDeleteRecipe(recipe.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      <RecipeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleAddRecipe}
      />
    </div>
  );
}
