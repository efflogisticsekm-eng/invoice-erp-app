with open("src/Scanner.jsx", "r") as f:
    content = f.read()

content = content.replace("""          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit expense.');
      }""", """        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to submit expense.');
      }
      if (response.data?.error) {
        throw new Error(response.data.error);
      }""")

with open("src/Scanner.jsx", "w") as f:
    f.write(content)
