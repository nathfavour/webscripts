#!/usr/bin/env python3
"""
strip.py - Process web pages into AI-friendly structured format
"""

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Union, Any

import requests
from bs4 import BeautifulSoup, Tag, NavigableString
import html2text


class WebpageProcessor:
    """Process webpages into AI-friendly structured format."""

    def __init__(self, min_text_length: int = 10, 
                 ignore_classes: List[str] = None,
                 ignore_ids: List[str] = None):
        """
        Initialize the processor with configurable options.
        
        Args:
            min_text_length: Minimum length of text to consider meaningful
            ignore_classes: CSS classes to ignore (ads, menus, etc.)
            ignore_ids: Element IDs to ignore
        """
        self.min_text_length = min_text_length
        self.ignore_classes = ignore_classes or ["ad", "advertisement", "banner", 
                                                "cookie", "popup", "menu-item", 
                                                "footer", "sidebar"]
        self.ignore_ids = ignore_ids or ["ad", "advertisement", "banner", 
                                        "cookie-notice", "popup", "sidebar"]
        self.h2t = html2text.HTML2Text()
        self.h2t.ignore_links = False
        self.h2t.ignore_images = False
        self.h2t.ignore_tables = False
        self.h2t.body_width = 0  # No wrapping
    
    def fetch_url(self, url: str) -> Optional[str]:
        """Fetch content from URL."""
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            return response.text
        except Exception as e:
            print(f"Error fetching URL: {e}", file=sys.stderr)
            return None
    
    def read_file(self, filepath: str) -> Optional[str]:
        """Read content from file."""
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            print(f"Error reading file: {e}", file=sys.stderr)
            return None
    
    def should_ignore_element(self, element: Tag) -> bool:
        """Check if element should be ignored based on class/id."""
        if not isinstance(element, Tag):
            return False
            
        # Check if any classes match ignore patterns
        if element.get("class"):
            for cls in element.get("class"):
                if any(ignored in cls.lower() for ignored in self.ignore_classes):
                    return True
        
        # Check if id matches ignore patterns
        if element.get("id"):
            element_id = element.get("id").lower()
            if any(ignored in element_id for ignored in self.ignore_ids):
                return True
                
        return False
    
    def get_element_type(self, element: Tag) -> str:
        """Determine semantic element type with detailed interaction capabilities."""
        if not isinstance(element, Tag):
            return "text"
        
        # Extract common interactive attributes
        is_clickable = False
        is_interactive = False
        is_scrollable = False
        
        # Check for clickable elements
        if (element.name in ["a", "button", "summary"] or 
            element.get("onclick") or 
            element.get("role") in ["button", "link", "menuitem"] or
            element.get("tabindex") == "0" or
            element.get("class") and any(cls for cls in element.get("class") if "btn" in cls.lower() or "button" in cls.lower())
           ):
            is_clickable = True
            
        # Check for interactive elements
        if (element.name in ["input", "select", "textarea", "button", "a"] or
            element.get("contenteditable") == "true" or
            element.get("role") in ["textbox", "combobox", "slider", "checkbox", "radio", "menuitem", "tab"] or
            element.get("tabindex") and element.get("tabindex") != "-1"
           ):
            is_interactive = True
            
        # Check for potentially scrollable containers
        if (element.get("style") and ("overflow" in element.get("style") or "scroll" in element.get("style")) or
            element.get("class") and any(cls for cls in element.get("class") if "scroll" in cls.lower())
           ):
            is_scrollable = True
            
        # Now determine the primary element type
        element_type = "other"
        
        # Determine semantic element type
        if element.name in ["h1", "h2", "h3", "h4", "h5", "h6"]:
            element_type = "heading"
        elif element.name == "a" and element.get("href"):
            element_type = "link"
        elif element.name == "img":
            element_type = "image"
        elif element.name == "ul" or element.name == "ol":
            element_type = "list"
        elif element.name == "li":
            element_type = "list_item"
        elif element.name == "table":
            element_type = "table"
        elif element.name == "tr":
            element_type = "table_row"
        elif element.name == "td" or element.name == "th":
            element_type = "table_cell"
        elif element.name == "form":
            element_type = "form"
        elif element.name == "button":
            element_type = "button"
        elif element.name == "input":
            input_type = element.get("type", "text")
            element_type = f"input_{input_type}"
        elif element.name == "textarea":
            element_type = "textarea"
        elif element.name == "select":
            element_type = "select"
        elif element.name == "option":
            element_type = "option"
        elif element.name == "label":
            element_type = "label"
        elif element.name == "code" or element.name == "pre":
            element_type = "code"
        elif element.name == "blockquote":
            element_type = "quote"
        elif element.name in ["iframe", "frame", "embed"]:
            element_type = "embedded_content"
        elif element.name == "audio":
            element_type = "audio"
        elif element.name == "video":
            element_type = "video"
        elif element.name == "canvas":
            element_type = "canvas"
        elif element.name == "svg":
            element_type = "svg"
        elif element.name == "dialog":
            element_type = "dialog"
        elif element.name == "details":
            element_type = "expandable"
        elif element.name == "summary":
            element_type = "expander"
        elif element.name in ["div", "section", "article"]:
            element_type = "container"
        elif element.name == "p":
            element_type = "paragraph"
        elif element.name == "nav":
            element_type = "navigation"
        elif element.name == "header":
            element_type = "header"
        elif element.name == "footer":
            element_type = "footer"
        elif element.name == "aside":
            element_type = "sidebar"
        elif element.name == "main":
            element_type = "main_content"
        
        # Check for ARIA roles that override the default semantic type
        if element.get("role"):
            aria_role = element.get("role")
            if aria_role in ["button", "link", "checkbox", "radio", "tab", "menuitem", "combobox",
                           "listbox", "textbox", "searchbox", "slider", "spinbutton", "switch",
                           "grid", "treegrid", "menu", "menubar", "tree", "tablist", "dialog"]:
                element_type = f"aria_{aria_role}"
        
        # Add interaction capabilities as a suffix if they exist
        interaction_traits = []
        if is_clickable:
            interaction_traits.append("clickable")
        if is_interactive:
            interaction_traits.append("interactive")
        if is_scrollable:
            interaction_traits.append("scrollable")
            
        # Return the element type with potential interaction traits
        if interaction_traits:
            return f"{element_type}:{','.join(interaction_traits)}"
        return element_type

    def extract_metadata(self, soup: BeautifulSoup) -> Dict:
        """Extract metadata from the page."""
        metadata = {
            "title": None,
            "description": None,
            "keywords": None,
            "canonical_url": None,
            "language": None,
        }
        
        # Extract title
        if soup.title:
            metadata["title"] = soup.title.get_text().strip()
        
        # Extract metadata tags
        for meta in soup.find_all("meta"):
            name = meta.get("name", "").lower()
            property_name = meta.get("property", "").lower()
            
            if name == "description" or property_name == "og:description":
                metadata["description"] = meta.get("content", "")
            elif name == "keywords":
                metadata["keywords"] = meta.get("content", "")
            elif property_name == "og:url":
                metadata["canonical_url"] = meta.get("content", "")
            
        # Extract language
        html_tag = soup.find("html")
        if html_tag and html_tag.get("lang"):
            metadata["language"] = html_tag.get("lang")
            
        # Extract canonical URL
        canonical = soup.find("link", rel="canonical")
        if canonical and canonical.get("href"):
            metadata["canonical_url"] = canonical.get("href")
            
        return {k: v for k, v in metadata.items() if v is not None}

    def extract_element_content(self, element: Union[Tag, NavigableString], 
                               depth: int = 0, max_depth: int = 3) -> Dict:
        """
        Extract content and structure from element recursively with detailed interactive properties.
        
        Args:
            element: BeautifulSoup element
            depth: Current recursion depth
            max_depth: Maximum recursion depth
        
        Returns:
            Dict containing element structure and content with interactive properties
        """
        # Handle plain text
        if isinstance(element, NavigableString):
            text = str(element).strip()
            if text and len(text) >= self.min_text_length:
                return {"type": "text", "content": text}
            return None
        
        # Skip ignored elements
        if self.should_ignore_element(element):
            return None
            
        # Get element type and basic attributes
        element_type = self.get_element_type(element)
        result = {"type": element_type}
        
        # Extract text content
        text_content = element.get_text().strip()
        if text_content:
            result["text"] = text_content
            
        # Extract attributes based on element type
        if "link" in element_type or element.name == "a":
            result["href"] = element.get("href", "")
            result["text"] = text_content
            # Check if it's an external link
            if result["href"] and result["href"].startswith(("http", "https", "ftp", "mailto")):
                result["external"] = True
                
        elif "image" in element_type or element.name == "img":
            result["src"] = element.get("src", "")
            result["alt"] = element.get("alt", "")
            if element.get("width"):
                result["width"] = element.get("width")
            if element.get("height"):
                result["height"] = element.get("height")
                
        elif "heading" in element_type or element.name in ["h1", "h2", "h3", "h4", "h5", "h6"]:
            result["level"] = element.name[1]  # h1 -> 1, h2 -> 2, etc.
            result["text"] = text_content
            
        elif "input" in element_type or element.name == "input":
            input_type = element.get("type", "text")
            result["input_type"] = input_type
            result["name"] = element.get("name", "")
            result["placeholder"] = element.get("placeholder", "")
            
            # Add more detailed input information
            if element.get("required"):
                result["required"] = True
            if element.get("disabled"):
                result["disabled"] = True
            if element.get("readonly"):
                result["readonly"] = True
            if element.get("value"):
                result["value"] = element.get("value")
            if element.get("min"):
                result["min"] = element.get("min")
            if element.get("max"):
                result["max"] = element.get("max")
            if element.get("maxlength"):
                result["maxlength"] = element.get("maxlength")
                
        elif "button" in element_type or element.name == "button":
            result["button_type"] = element.get("type", "submit")
            if element.get("disabled"):
                result["disabled"] = True
            if element.get("form"):
                result["form"] = element.get("form")
                
        elif "textarea" in element_type or element.name == "textarea":
            result["name"] = element.get("name", "")
            result["rows"] = element.get("rows", "")
            result["cols"] = element.get("cols", "")
            if element.get("required"):
                result["required"] = True
            if element.get("disabled"):
                result["disabled"] = True
            if element.get("readonly"):
                result["readonly"] = True
                
        elif "select" in element_type or element.name == "select":
            result["name"] = element.get("name", "")
            result["multiple"] = element.has_attr("multiple")
            
            # Extract options
            options = []
            for option in element.find_all("option"):
                option_data = {
                    "value": option.get("value", ""),
                    "text": option.get_text().strip()
                }
                if option.has_attr("selected"):
                    option_data["selected"] = True
                if option.has_attr("disabled"):
                    option_data["disabled"] = True
                options.append(option_data)
                
            if options:
                result["options"] = options
        
        elif "table" in element_type and element.name == "table":
            # Extract basic table structure
            result["rows"] = len(element.find_all("tr"))
            if element.find("thead"):
                result["has_header"] = True
            if element.find("tbody"):
                result["has_body"] = True
            if element.find("tfoot"):
                result["has_footer"] = True
                
        elif "iframe" in element_type or element.name == "iframe":
            result["src"] = element.get("src", "")
            if element.get("width"):
                result["width"] = element.get("width")
            if element.get("height"):
                result["height"] = element.get("height")
        
        elif "video" in element_type or element.name == "video":
            result["src"] = element.get("src", "")
            result["controls"] = element.has_attr("controls")
            result["autoplay"] = element.has_attr("autoplay")
            result["loop"] = element.has_attr("loop")
            result["muted"] = element.has_attr("muted")
            
        # Extract general interactive attributes
        if element.get("onclick") or element.get("role") == "button":
            result["clickable"] = True
            
        if element.has_attr("tabindex") and element["tabindex"] != "-1":
            result["focusable"] = True
            result["tabindex"] = element["tabindex"]
            
        if element.get("contenteditable") == "true":
            result["editable"] = True
            
        if element.get("draggable") == "true":
            result["draggable"] = True
            
        # Check for scrollable styles
        if element.get("style"):
            style = element.get("style")
            if "overflow" in style and any(val in style for val in ["auto", "scroll"]):
                result["scrollable"] = True
                
        # Extract ARIA attributes for accessibility information
        aria_attrs = {}
        for attr_name, attr_value in element.attrs.items():
            if attr_name.startswith("aria-"):
                aria_key = attr_name.replace("aria-", "")
                aria_attrs[aria_key] = attr_value
                
        if aria_attrs:
            result["aria"] = aria_attrs
            
        # Get CSS identifiers that may indicate semantic purpose
        if element.get("class"):
            result["classes"] = element["class"]
        if element.get("id"):
            result["id"] = element["id"]
            
        # Extract data attributes which often contain app-specific information
        data_attrs = {}
        for attr_name, attr_value in element.attrs.items():
            if attr_name.startswith("data-"):
                data_key = attr_name.replace("data-", "")
                data_attrs[data_key] = attr_value
                
        if data_attrs:
            result["data_attrs"] = data_attrs

        # Recursively process children if not at max depth and element can have children
        if depth < max_depth and element.contents:
            children = []
            for child in element.children:
                if isinstance(child, (Tag, NavigableString)):
                    child_content = self.extract_element_content(child, depth + 1, max_depth)
                    if child_content:
                        children.append(child_content)
                    
            if children:
                result["children"] = children
                
        return result
        
    def categorize_content(self, soup: BeautifulSoup) -> Dict:
        """
        Categorize page content into semantic sections.
        
        Returns a dictionary with categorized content.
        """
        # Extract main content sections
        result: Dict[str, List[Any]] = defaultdict(list)
        
        # Process main content areas
        main_content = soup.find("main")
        if not main_content:
            # Try other common content containers
            main_content = soup.find(["article", "div", "section"], 
                                    class_=lambda c: c and any(x in str(c).lower() 
                                                            for x in ["content", "main", "article"]))
        
        if main_content:
            # Extract main content
            content = self.extract_element_content(main_content)
            if content:
                result["main_content"].append(content)
        
        # Extract navigation
        navigation = soup.find("nav")
        if navigation:
            nav_content = self.extract_element_content(navigation)
            if nav_content:
                result["navigation"].append(nav_content)
        
        # Extract header content
        header = soup.find("header")
        if header:
            header_content = self.extract_element_content(header)
            if header_content:
                result["header"].append(header_content)
        
        # Extract footer
        footer = soup.find("footer")
        if footer:
            footer_content = self.extract_element_content(footer)
            if footer_content:
                result["footer"].append(footer_content)
                
        # Extract headings
        for heading in soup.find_all(['h1', 'h2', 'h3']):
            if not self.should_ignore_element(heading):
                heading_content = self.extract_element_content(heading)
                if heading_content:
                    result["headings"].append(heading_content)
        
        # If no main content identified yet, try a different approach
        if not result["main_content"]:
            # Find all paragraphs with substantial text
            for p in soup.find_all('p'):
                if len(p.get_text().strip()) >= self.min_text_length * 2:
                    p_content = self.extract_element_content(p)
                    if p_content:
                        result["paragraphs"].append(p_content)
        
        # Extract links
        important_links = []
        for a in soup.find_all('a', href=True):
            if not self.should_ignore_element(a) and a.get_text().strip():
                link_content = self.extract_element_content(a)
                if link_content:
                    important_links.append(link_content)
        
        if important_links:
            result["important_links"] = important_links[:10]  # Limit to most important
            
        return {k: v for k, v in result.items() if v}
    
    def create_text_summary(self, soup: BeautifulSoup) -> str:
        """Create a plain text summary of the page."""
        # Extract title and main content
        title = soup.title.get_text() if soup.title else ""
        
        # Find main content section
        main_content = soup.find("main") or soup.find(["article", "div", "section"], 
                                                     class_=lambda c: c and any(x in str(c).lower() 
                                                                            for x in ["content", "main", "article"]))
        
        if not main_content:
            main_content = soup
            
        # Convert to markdown-like text
        text = self.h2t.handle(str(main_content))
        
        # Clean up text
        text = re.sub(r'\n{3,}', '\n\n', text)  # Remove excessive newlines
        
        return f"# {title}\n\n{text}" if title else text
    
    def process_html(self, html_content: str) -> Dict:
        """Process HTML content into AI-consumable format."""
        soup = BeautifulSoup(html_content, "html.parser")
        
        # Remove script and style elements
        for script in soup(["script", "style", "noscript"]):
            script.decompose()
            
        return {
            "metadata": self.extract_metadata(soup),
            "categorized_content": self.categorize_content(soup),
            "text_summary": self.create_text_summary(soup)
        }
    
    def process_input(self, input_source: str, is_url: bool = False) -> Dict:
        """
        Process input source (URL or file or HTML string).
        
        Args:
            input_source: URL, file path, or HTML string
            is_url: Whether input_source is a URL
        """
        html_content = None
        
        if is_url:
            html_content = self.fetch_url(input_source)
        elif Path(input_source).is_file():
            html_content = self.read_file(input_source)
        elif "<html" in input_source.lower():
            html_content = input_source
        else:
            # Try to guess if it's a URL anyway
            if input_source.startswith(("http://", "https://")):
                html_content = self.fetch_url(input_source)
            else:
                html_content = input_source
        
        if not html_content:
            return {"error": "Could not process input source"}
            
        return self.process_html(html_content)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Process web pages into AI-friendly structured format."
    )
    parser.add_argument(
        "input", 
        help="Input URL, file path, or HTML string"
    )
    parser.add_argument(
        "-o", "--output", 
        help="Output file path (omit to print to stdout)"
    )
    parser.add_argument(
        "-u", "--url", 
        action="store_true", 
        help="Treat input as URL"
    )
    parser.add_argument(
        "-f", "--format",
        choices=["json", "text"], 
        default="json",
        help="Output format (json or text)"
    )
    parser.add_argument(
        "--min-length", 
        type=int, 
        default=10,
        help="Minimum text length to include"
    )
    
    args = parser.parse_args()
    
    processor = WebpageProcessor(min_text_length=args.min_length)
    result = processor.process_input(args.input, is_url=args.url)
    
    if args.format == "text":
        output = result.get("text_summary", "Error: No text summary available")
    else:
        output = json.dumps(result, indent=2, ensure_ascii=False)
    
    if args.output:
        try:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(output)
            print(f"Output written to {args.output}")
        except Exception as e:
            print(f"Error writing to output file: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        print(output)


if __name__ == "__main__":
    main()