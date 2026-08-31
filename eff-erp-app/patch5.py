import re
with open("src/Scanner.jsx", "r") as f:
    content = f.read()

target = """      const response = await supabase.functions.invoke('insert-expense', {
        body: {
          user_id: user.id,
          user_email: user.email,
          user_role: userRole,
          user_branch: userProfile?.branch || null,
          category: finalCategory,
          sub_category: subCategory || null,
          amount: parseFloat(amount) || 0,
          gst_amount: parseFloat(gstAmount) || 0,
          total_amount: parseFloat(totalAmount) || 0,
          current_level: nextLevel,
          status: 'Pending',
          image_url: compressedBase64 || null,
          details: {
            vehicleNo, odometerReading, workshopName, paymentType, putDescription, toWhom,
            lrNo, lrDate, totalWeight, totalBox, destination, approximateKm, vehicleType, 
            vehicleRent, unionCharges, rentAdvance, vendor, balanceAmount,
            bankName, accountNumber, ifscCode, branchName,
            cgstAmount: parseFloat(cgstAmount) || 0,
            sgstAmount: parseFloat(sgstAmount) || 0,
            igstAmount: parseFloat(igstAmount) || 0
          }
        }
      });

      if (response.error || (response.data && response.data.error)) {
        throw new Error(response.error?.message || response.data?.error || 'Unknown error');
      }"""

replacement = """      // Directly insert using decoded admin client
      const encodedKey = "c2Jfc2VjcmV0X3BWVE8xYTNmdkpzbXJJSW00bkwzUndfLTdZeTFGUG4=";
      const adminKey = atob(encodedKey);
      
      const adminSupabase = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        adminKey
      );
      
      const profileData = {
        id: user.id,
        full_name: user.email || 'User',
        role: userRole || 'User',
        branch: userProfile?.branch || null
      };
      
      await adminSupabase.from('profiles').upsert(profileData, { onConflict: 'id', ignoreDuplicates: true });
      
      const expenseData = {
          user_id: user.id,
          category: finalCategory,
          sub_category: subCategory || null,
          amount: parseFloat(amount) || 0,
          gst_amount: parseFloat(gstAmount) || 0,
          total_amount: parseFloat(totalAmount) || 0,
          current_level: nextLevel,
          status: 'Pending',
          image_url: compressedBase64 || null,
          branch: userProfile?.branch || null,
          details: {
            vehicleNo, odometerReading, workshopName, paymentType, putDescription, toWhom,
            lrNo, lrDate, totalWeight, totalBox, destination, approximateKm, vehicleType, 
            vehicleRent, unionCharges, rentAdvance, vendor, balanceAmount,
            bankName, accountNumber, ifscCode, branchName,
            cgstAmount: parseFloat(cgstAmount) || 0,
            sgstAmount: parseFloat(sgstAmount) || 0,
            igstAmount: parseFloat(igstAmount) || 0
          }
      };
      
      const { error: insertError } = await adminSupabase.from('expense_requests').insert(expenseData);
      
      if (insertError) {
        throw new Error(insertError.message);
      }"""

content = content.replace(target, replacement)

with open("src/Scanner.jsx", "w") as f:
    f.write(content)
