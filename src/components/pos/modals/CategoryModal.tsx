"use client";

import { useEffect, useState } from "react";
import { usePosStore } from "@/stores/pos-store";
import { updateCategory, loadData } from "@/lib/repositories";
import { showToast } from "@/components/pos/Toast";
import { EMOJI_OPTIONS } from "@/types/pos";
import type { Category } from "@/types/pos";

let openExternal: ((id: number) => void) | null = null;
export function openCategoryModal(id: number) {
  if (openExternal) openExternal(id);
}

export function CategoryModal() {
  const setCategories = usePosStore((s) => s.setCategories);
  const setProducts = usePosStore((s) => s.setProducts);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#EF4444");
  const [emoji, setEmoji] = useState("🍛");

  useEffect(() => {
    openExternal = (id: number) => {
      const cat = usePosStore.getState().categories.find((c) => c.id === id);
      if (!cat) return;
      setEditingId(id);
      setName(cat.name);
      setColor(cat.color || "#EF4444");
      setEmoji(cat.emoji || "🍛");
      setOpen(true);
    };
    return () => {
      openExternal = null;
    };
  }, []);

  const close = () => setOpen(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const cat: Category = { id: editingId, name: name.trim(), color, emoji };
    await updateCategory(cat);
    const data = await loadData();
    setCategories(data.categories);
    setProducts(data.products);
    setOpen(false);
    showToast("Category Updated", "success");
  };

  if (!open) return null;

  return (
    <div className="modal active" id="categoryModal">
      <div className="modal-content">
        <div className="modal-header">
          <h3>Edit Category</h3>
          <button type="button" className="modal-close" id="closeCategoryModal" onClick={close}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        <form id="categoryForm" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="editCategoryName">Category Name</label>
            <input
              type="text"
              id="editCategoryName"
              className="form-input"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="editCategoryColor">Category Color</label>
            <div className="color-picker-wrapper">
              <input
                type="color"
                id="editCategoryColor"
                className="form-input color-picker"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <span
                id="editColorDisplay"
                className="color-display"
                style={{ backgroundColor: color }}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Category Emoji</label>
            <div className="emoji-picker-container" id="editCategoryEmojiPicker">
              {EMOJI_OPTIONS.map((em) => (
                <div
                  key={em}
                  className={`emoji-option ${emoji === em ? "selected" : ""}`}
                  data-emoji={em}
                  onClick={() => setEmoji(em)}
                >
                  {em}
                </div>
              ))}
            </div>
            <input type="hidden" id="editCategoryEmoji" value={emoji} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" id="cancelCategory" onClick={close}>
              <i className="fas fa-times"></i> Cancel
            </button>
            <button type="submit" className="btn-primary">
              <i className="fas fa-save"></i> Save Category
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
