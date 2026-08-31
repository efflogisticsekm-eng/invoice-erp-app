with open("src/Scanner.jsx", "r") as f:
    content = f.read()

content = content.replace("""          }
        })
      });

      const resData = await response.json();
      if (!response.ok || resData.error) throw new Error(resData.error || 'Unknown error');""", """          }
        }
      });

      if (response.error || (response.data && response.data.error)) {
        throw new Error(response.error?.message || response.data?.error || 'Unknown error');
      }""")

with open("src/Scanner.jsx", "w") as f:
    f.write(content)
